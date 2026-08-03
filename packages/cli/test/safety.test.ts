import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ABSOLUTE_MAX_BATCH_SIZE,
  DEFAULT_MAX_BATCH_SIZE,
  addressEntryKey,
  applyDuplicatePolicy,
  confirmSubmission,
  describeDefaultedChains,
  describeUnusedOutputDir,
  enforceBatchLimits,
  findDuplicates,
  formatReportedChain,
  summariseReportedChains,
  resolveMaxBatchSize,
  transactionEntryKey,
} from '../src/lib/safety.js';

/**
 * Audit V16 — CLI blast radius.
 *
 * These tests exist because every guard here stands between a mistyped command and a
 * permanent, public fraud accusation about a third party. They assert the *refusals*, not the
 * happy path: a regression that silently re-opens any of them is exactly the failure mode the
 * finding describes.
 */

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SIZE
// ═══════════════════════════════════════════════════════════════════════════

describe('enforceBatchLimits', () => {
  // An empty batch still pays the flat per-batch operator fee (audit V8), so it is a pure
  // loss, not a harmless no-op.
  it('refuses an empty batch', () => {
    expect(() => enforceBatchLimits({ count: 0, label: 'wallets' })).toThrow(/no wallets/i);
  });

  it('accepts a batch at exactly the default limit', () => {
    expect(() =>
      enforceBatchLimits({ count: DEFAULT_MAX_BATCH_SIZE, label: 'wallets' })
    ).not.toThrow();
  });

  // 800 is the recommended ceiling derived from ~26,825 gas/entry against a 25M gas
  // transaction. One over must fail, or the cap is decorative.
  it('refuses one entry over the default limit', () => {
    expect(() =>
      enforceBatchLimits({ count: DEFAULT_MAX_BATCH_SIZE + 1, label: 'wallets' })
    ).toThrow(new RegExp(String(DEFAULT_MAX_BATCH_SIZE)));
  });

  it('honours a raised --max-batch-size', () => {
    expect(() =>
      enforceBatchLimits({ count: 900, maxBatchSize: 900, label: 'contracts' })
    ).not.toThrow();
  });

  it('still refuses above a raised limit', () => {
    expect(() => enforceBatchLimits({ count: 901, maxBatchSize: 900, label: 'contracts' })).toThrow(
      /exceeds the maximum of 900/
    );
  });

  it('mentions --max-batch-size only while the default is in force', () => {
    expect(() => enforceBatchLimits({ count: 1000, label: 'wallets' })).toThrow(/--max-batch-size/);
    expect(() =>
      enforceBatchLimits({ count: 1000, maxBatchSize: ABSOLUTE_MAX_BATCH_SIZE, label: 'wallets' })
    ).toThrow(/^(?!.*--max-batch-size)/s);
  });
});

describe('resolveMaxBatchSize', () => {
  it('defaults when unset', () => {
    expect(resolveMaxBatchSize(undefined)).toBe(DEFAULT_MAX_BATCH_SIZE);
  });

  // The hard ceiling is not advisory: 950 x 26,825 gas already exceeds 25M, so a larger batch
  // reverts on chain after the fee is charged. Failing locally is strictly cheaper.
  it('refuses to go past the hard ceiling', () => {
    expect(() => resolveMaxBatchSize(ABSOLUTE_MAX_BATCH_SIZE + 1)).toThrow(/hard ceiling/);
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses %s', (value) => {
    expect(() => resolveMaxBatchSize(value)).toThrow(/Invalid --max-batch-size/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATES
// ═══════════════════════════════════════════════════════════════════════════

const WALLET_A = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';
const WALLET_B = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const CHAIN_BASE = '0x0000000000000000000000000000000000000000000000000000000000002105';
const CHAIN_OP = '0x000000000000000000000000000000000000000000000000000000000000000a';

describe('findDuplicates', () => {
  it('reports nothing for a clean file', () => {
    const entries = [
      { address: WALLET_A, chainId: CHAIN_BASE },
      { address: WALLET_B, chainId: CHAIN_BASE },
    ];
    expect(findDuplicates(entries, addressEntryKey)).toEqual([]);
  });

  // Spreadsheet exports mix EIP-55 checksummed and lowercase forms of the same address. On
  // chain they are one entry, so case must not hide a duplicate.
  it('treats differently-cased addresses as the same entry', () => {
    const entries = [
      { address: WALLET_A, chainId: CHAIN_BASE },
      { address: WALLET_A.toLowerCase(), chainId: CHAIN_BASE },
    ];
    const duplicates = findDuplicates(entries, addressEntryKey);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.indices).toEqual([0, 1]);
  });

  // The same address on two chains is two genuine registrations, not a duplicate. Keying on
  // the address alone would silently drop one of them.
  it('does not collapse the same address on different chains', () => {
    const entries = [
      { address: WALLET_A, chainId: CHAIN_BASE },
      { address: WALLET_A, chainId: CHAIN_OP },
    ];
    expect(findDuplicates(entries, addressEntryKey)).toEqual([]);
  });

  it('keys transactions on hash and chain', () => {
    const txHash = `0x${'ab'.repeat(32)}`;
    const entries = [
      { txHash, chainId: CHAIN_BASE },
      { txHash: txHash.toUpperCase().replace('0X', '0x'), chainId: CHAIN_BASE },
    ];
    expect(findDuplicates(entries, transactionEntryKey)).toHaveLength(1);
  });
});

describe('applyDuplicatePolicy', () => {
  const duped = [
    { address: WALLET_A, chainId: CHAIN_BASE },
    { address: WALLET_B, chainId: CHAIN_BASE },
    { address: WALLET_A, chainId: CHAIN_BASE },
  ];

  // Fail-closed by default: a file with repeats is usually a file assembled wrongly, and the
  // on-chain skip means the operator's reported count would not match what was registered.
  it('refuses a file with duplicates by default', () => {
    expect(() => applyDuplicatePolicy(duped, addressEntryKey, { label: 'wallets' })).toThrow(
      /duplicated wallets/
    );
  });

  it('names the offending rows so the file can be fixed', () => {
    expect(() => applyDuplicatePolicy(duped, addressEntryKey, { label: 'wallets' })).toThrow(
      /rows 1, 3/
    );
  });

  it('keeps the first occurrence of each key under --dedupe', () => {
    const result = applyDuplicatePolicy(duped, addressEntryKey, {
      label: 'wallets',
      dedupe: true,
    });
    expect(result.entries).toEqual([duped[0], duped[1]]);
    expect(result.duplicates).toHaveLength(1);
  });

  it('passes a clean file through untouched', () => {
    const clean = [{ address: WALLET_A, chainId: CHAIN_BASE }];
    const result = applyDuplicatePolicy(clean, addressEntryKey, { label: 'wallets' });
    expect(result.entries).toEqual(clean);
    expect(result.duplicates).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════

function confirmOptions(overrides: Record<string, unknown> = {}) {
  return {
    env: 'testnet' as const,
    label: 'wallets',
    count: 42,
    chainName: 'Base Sepolia',
    chainId: 84532,
    contractAddress: '0x0000000000000000000000000000000000000abc',
    fee: '0 ETH',
    sample: [WALLET_A, WALLET_B],
    write: () => {},
    ...overrides,
  };
}

describe('confirmSubmission', () => {
  it('proceeds when the operator types yes', async () => {
    const prompt = vi.fn().mockResolvedValue('yes');
    await expect(confirmSubmission(confirmOptions({ prompt }))).resolves.toBeUndefined();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it.each(['no', '', 'y', 'YES'])('cancels on %o', async (answer) => {
    const prompt = vi.fn().mockResolvedValue(answer);
    await expect(confirmSubmission(confirmOptions({ prompt }))).rejects.toThrow(/cancelled/i);
  });

  // Mainnet demands the entry count rather than "yes". A reflexive "y" does not defend
  // against pointing the command at the wrong file; a number read off the summary does.
  it('requires the entry count on mainnet', async () => {
    const prompt = vi.fn().mockResolvedValue('yes');
    await expect(confirmSubmission(confirmOptions({ env: 'mainnet', prompt }))).rejects.toThrow(
      /cancelled/i
    );

    const correct = vi.fn().mockResolvedValue('42');
    await expect(
      confirmSubmission(confirmOptions({ env: 'mainnet', prompt: correct }))
    ).resolves.toBeUndefined();
  });

  it('never prompts under --yes', async () => {
    const prompt = vi.fn();
    await expect(
      confirmSubmission(confirmOptions({ assumeYes: true, prompt }))
    ).resolves.toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();
  });

  // ── --yes on mainnet requires SWR_CONFIRM_COUNT ────────────────────────────
  //
  // The count prompt is the only rail that defends against the V16 scenario (wrong file /
  // wrong environment), and `--yes` used to skip it outright. The realistic failure is an
  // operator replaying a testnet command from shell history with `-e mainnet` swapped in and
  // `-y` riding along invisibly. On mainnet, automation must now assert the number it believes
  // it is submitting.
  describe('--yes on mainnet', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('refuses when SWR_CONFIRM_COUNT is absent', async () => {
      vi.stubEnv('SWR_CONFIRM_COUNT', undefined);
      const prompt = vi.fn();
      await expect(
        confirmSubmission(confirmOptions({ env: 'mainnet', assumeYes: true, prompt }))
      ).rejects.toThrow(/SWR_CONFIRM_COUNT/);
      expect(prompt).not.toHaveBeenCalled();
    });

    it('proceeds when SWR_CONFIRM_COUNT matches the parsed entry count', async () => {
      vi.stubEnv('SWR_CONFIRM_COUNT', '42');
      const prompt = vi.fn();
      await expect(
        confirmSubmission(confirmOptions({ env: 'mainnet', assumeYes: true, prompt }))
      ).resolves.toBeUndefined();
      expect(prompt).not.toHaveBeenCalled();
    });

    it('refuses on a mismatch and names both numbers', async () => {
      vi.stubEnv('SWR_CONFIRM_COUNT', '41');
      const error = await confirmSubmission(
        confirmOptions({ env: 'mainnet', assumeYes: true, prompt: vi.fn() })
      ).catch((e: Error) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('41');
      expect((error as Error).message).toContain('42');
    });

    it('refuses a non-numeric SWR_CONFIRM_COUNT', async () => {
      vi.stubEnv('SWR_CONFIRM_COUNT', 'yes');
      await expect(
        confirmSubmission(confirmOptions({ env: 'mainnet', assumeYes: true, prompt: vi.fn() }))
      ).rejects.toThrow(/SWR_CONFIRM_COUNT/);
    });

    // Regression guard: the new rail is mainnet-only. Testnet and local keep --yes as-is,
    // because the point of the rail is the irreversible mainnet write.
    it.each(['testnet', 'local'] as const)('leaves --yes on %s unchanged', async (env) => {
      vi.stubEnv('SWR_CONFIRM_COUNT', undefined);
      const prompt = vi.fn();
      await expect(
        confirmSubmission(confirmOptions({ env, assumeYes: true, prompt }))
      ).resolves.toBeUndefined();
      expect(prompt).not.toHaveBeenCalled();
    });
  });

  it('shows the count, chain, contract and a sample before asking', async () => {
    const lines: string[] = [];
    await confirmSubmission(
      confirmOptions({
        prompt: vi.fn().mockResolvedValue('yes'),
        write: (line: string) => lines.push(line),
      })
    );
    const output = lines.join('\n');
    expect(output).toContain('42');
    expect(output).toContain('Base Sepolia');
    expect(output).toContain('84532');
    expect(output).toContain('0x0000000000000000000000000000000000000abc');
    expect(output).toContain(WALLET_A);
    expect(output).toMatch(/irreversible/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTED CHAIN (round-3 review S-4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The confirmation prompt showed `config.chain` — where the transaction LANDS, always the hub,
 * always right, and never the value that can be wrong. The chain each entry is reported on is
 * what `-c/--chain-id` controls, what gets written to storage, and it silently defaulted to
 * Base while being displayed nowhere. An operator exporting Optimism drainers with no chainId
 * column read "Chain: Base (8453)" — correct for the hub — confirmed, and permanently accused
 * 800 Base addresses.
 */
const entry = (reportedChain: string, chainIdDefaulted = false) => ({
  reportedChain,
  chainIdDefaulted,
});

describe('summariseReportedChains', () => {
  it('counts entries per reported chain, largest first', () => {
    const summary = summariseReportedChains([
      entry('eip155:10'),
      entry('eip155:8453'),
      entry('eip155:10'),
      entry('eip155:10'),
    ]);

    expect(summary).toEqual([
      { caip2: 'eip155:10', count: 3, defaultedCount: 0 },
      { caip2: 'eip155:8453', count: 1, defaultedCount: 0 },
    ]);
  });

  it('tracks how many entries inherited the default separately from the total', () => {
    const summary = summariseReportedChains([
      entry('eip155:8453', true),
      entry('eip155:8453', true),
      entry('eip155:8453'),
    ]);

    // Same chain, but two of the three never said so — that distinction is the finding.
    expect(summary).toEqual([{ caip2: 'eip155:8453', count: 3, defaultedCount: 2 }]);
  });

  it('returns nothing for an empty batch', () => {
    expect(summariseReportedChains([])).toEqual([]);
  });
});

describe('formatReportedChain', () => {
  it('names a chain we know', () => {
    expect(formatReportedChain('eip155:8453')).toBe('eip155:8453 (Base)');
  });

  it('falls back to the bare CAIP-2 string for a chain we do not', () => {
    expect(formatReportedChain('eip155:999999')).toBe('eip155:999999');
  });
});

describe('describeDefaultedChains', () => {
  it('is silent when every row stated its own chain', () => {
    expect(describeDefaultedChains(summariseReportedChains([entry('eip155:10')]))).toBeUndefined();
  });

  it('names the count and the chain that was assumed', () => {
    const warning = describeDefaultedChains(
      summariseReportedChains([entry('eip155:8453', true), entry('eip155:8453', true)])
    );
    expect(warning).toContain('2 entries have no chainId');
    expect(warning).toContain('eip155:8453 (Base)');
    expect(warning).toContain('--chain-id');
  });

  it('counts only the defaulted rows, not the whole chain group', () => {
    const warning = describeDefaultedChains(
      summariseReportedChains([entry('eip155:8453', true), entry('eip155:8453')])
    );
    expect(warning).toContain('1 entry has no chainId');
  });
});

/**
 * Round-4 finding 2. `-o` is read only on the --build-only path, so on a real submission it
 * produced an empty directory and no explanation — and the README's own examples paired it
 * with a real submission, so operators were taught the combination.
 */
describe('describeUnusedOutputDir', () => {
  it('is silent when -o is not passed', () => {
    expect(describeUnusedOutputDir({})).toBeUndefined();
    expect(describeUnusedOutputDir({ dryRun: true })).toBeUndefined();
  });

  it('is silent on --build-only, where -o is the whole point', () => {
    expect(describeUnusedOutputDir({ outputDir: './out', buildOnly: true })).toBeUndefined();
  });

  it('warns on a direct submission and names the directory', () => {
    const warning = describeUnusedOutputDir({ outputDir: './out' });
    expect(warning).toContain('./out');
    expect(warning).toContain('a direct submission');
    expect(warning).toContain('--build-only');
    expect(warning).toContain('No files will be written');
  });

  it('names --dry-run rather than a submission that is not happening', () => {
    const warning = describeUnusedOutputDir({ outputDir: './out', dryRun: true });
    expect(warning).toContain('--dry-run');
    expect(warning).not.toContain('direct submission');
  });
});

describe('confirmSubmission shows the reported chain', () => {
  async function summaryFor(overrides: Record<string, unknown>) {
    const lines: string[] = [];
    await confirmSubmission(
      confirmOptions({
        ...overrides,
        prompt: vi.fn().mockResolvedValue('yes'),
        write: (line: string) => lines.push(line),
      })
    );
    return lines.join('\n');
  }

  // The failure this closes: submitting on Base is correct AND the entries are reported on
  // Optimism. Only one of those two numbers was ever on screen.
  it('shows the reported chain alongside the submission chain', async () => {
    const output = await summaryFor({
      reportedChains: summariseReportedChains([entry('eip155:10'), entry('eip155:10')]),
    });

    expect(output).toContain('Base Sepolia'); // where the transaction lands
    expect(output).toContain('eip155:10'); // what the entries accuse
  });

  it('warns when the reported chain was assumed rather than stated', async () => {
    const output = await summaryFor({
      reportedChains: summariseReportedChains([entry('eip155:8453', true)]),
    });

    expect(output).toMatch(/no chainId/);
    expect(output).toContain('eip155:8453 (Base)');
  });

  it('does not warn when the file stated every chain', async () => {
    const output = await summaryFor({
      reportedChains: summariseReportedChains([entry('eip155:8453')]),
    });

    expect(output).toContain('eip155:8453');
    expect(output).not.toMatch(/no chainId/);
  });

  it('lists every chain in a mixed batch', async () => {
    const output = await summaryFor({
      reportedChains: summariseReportedChains([
        entry('eip155:10'),
        entry('eip155:42161'),
        entry('eip155:10'),
      ]),
    });

    expect(output).toContain('eip155:10');
    expect(output).toContain('eip155:42161');
  });
});
