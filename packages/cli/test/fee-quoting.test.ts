/**
 * Fee-quoting regression tests.
 *
 * These exist because a real bug shipped here: `submit-wallets` / `submit-transactions`
 * quoted the per-REGISTRATION fee (`<Registry>.quoteRegistration()`) for a call that goes
 * through `OperatorSubmitter`, whose fee is the flat per-BATCH
 * `OperatorSubmitter.quoteBatchFee()`. That overpays today (relying on the push refund,
 * which reverts for a Safe that cannot receive ETH) and reverts with
 * `OperatorSubmitter__InsufficientFee` the moment a batch fee is enabled.
 *
 * Nothing in the previous test suite asserted WHICH contract function was read, so the bug
 * was invisible to it. Every test below pins the (address, abi, functionName) triple of the
 * quote AND that the quoted wei is what lands in `value` — for both the live-submit path and
 * the `--build-only` multisig JSON.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OperatorSubmitterABI, WalletRegistryABI, TransactionRegistryABI } from '@swr/abis';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Fake deployment ─────────────────────────────────────────────────────────
// Distinct addresses so an assertion on `address` alone identifies the contract.
const OPERATOR_SUBMITTER = '0x00000000000000000000000000000000000005b1' as const;
const WALLET_REGISTRY = '0x00000000000000000000000000000000000000a1' as const;
const TRANSACTION_REGISTRY = '0x00000000000000000000000000000000000000a2' as const;
const CONTRACT_REGISTRY = '0x00000000000000000000000000000000000000a3' as const;
const FEE_MANAGER = '0x00000000000000000000000000000000000000a4' as const;

/** Non-zero and distinctive so it is unmistakable in `value`. */
const BATCH_FEE = 12_345n;
/** Deliberately different from BATCH_FEE — if this ever lands in `value`, the wrong quote won. */
const REGISTRATION_FEE = 999_000_000_000_000n;

const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

const mockConfig = {
  chain: { id: 31337, name: 'Test' },
  rpcUrl: 'http://127.0.0.1:8545',
  contracts: {
    registryHub: '0x00000000000000000000000000000000000000b0',
    operatorRegistry: '0x00000000000000000000000000000000000000b1',
    operatorSubmitter: OPERATOR_SUBMITTER,
    stolenWalletRegistry: WALLET_REGISTRY,
    stolenTransactionRegistry: TRANSACTION_REGISTRY,
    fraudulentContractRegistry: CONTRACT_REGISTRY,
    feeManager: FEE_MANAGER,
  },
};

vi.mock('../src/lib/config.js', () => ({
  getConfig: () => mockConfig,
}));

vi.mock('ora', () => {
  const spinner = {
    start: () => spinner,
    succeed: () => spinner,
    fail: () => spinner,
    stop: () => spinner,
  };
  return { default: () => spinner };
});

interface ReadCall {
  address: string;
  abi: unknown;
  functionName: string;
}
interface WriteCall extends ReadCall {
  value?: bigint;
}

const readCalls: ReadCall[] = [];
const writeCalls: WriteCall[] = [];

const readContract = vi.fn(async (args: ReadCall) => {
  readCalls.push(args);
  if (args.functionName === 'quoteBatchFee') return BATCH_FEE;
  if (args.functionName === 'quoteRegistration') return REGISTRATION_FEE;
  if (args.functionName === 'currentFeeWei') return REGISTRATION_FEE;
  throw new Error(`unexpected read: ${args.functionName}`);
});

const writeContract = vi.fn(async (args: WriteCall) => {
  writeCalls.push(args);
  return '0xdeadbeef';
});

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract,
      waitForTransactionReceipt: async () => ({ blockNumber: 1n, gasUsed: 21_000n }),
    }),
    createWalletClient: () => ({ writeContract }),
  };
});

const { submitWallets } = await import('../src/commands/submit-wallets.js');
const { submitTransactions } = await import('../src/commands/submit-transactions.js');
const { submitContracts } = await import('../src/commands/submit-contracts.js');
const { quote } = await import('../src/commands/quote.js');

const walletsFixture = join(__dirname, 'fixtures', 'wallets.json');
const contractsFixture = join(__dirname, 'fixtures', 'contracts.json');
const transactionsFixture = join(__dirname, 'fixtures', 'transactions.json');

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  readCalls.length = 0;
  writeCalls.length = 0;
  readContract.mockClear();
  writeContract.mockClear();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

/** The MultisigTransaction JSON printed by --build-only when no --output-dir is given. */
function capturedMultisigJson(): { to: string; value: string; data: string; entryCount: number } {
  for (const call of logSpy.mock.calls) {
    const arg = call[0];
    if (typeof arg === 'string' && arg.trimStart().startsWith('{')) {
      return JSON.parse(arg);
    }
  }
  throw new Error('no multisig JSON was printed');
}

/** The single fee quote the command performed. Fails loudly on 0 or >1 quotes. */
function theQuote(): ReadCall {
  const quotes = readCalls.filter((c) =>
    /^(quoteBatchFee|quoteRegistration|currentFeeWei)$/.test(c.functionName)
  );
  expect(quotes).toHaveLength(1);
  return quotes[0];
}

function expectOperatorBatchQuote(call: ReadCall) {
  expect(call.functionName).toBe('quoteBatchFee');
  expect(call.address).toBe(OPERATOR_SUBMITTER);
  expect(call.abi).toBe(OperatorSubmitterABI);
}

describe('operator batch submissions quote OperatorSubmitter.quoteBatchFee', () => {
  const cases = [
    {
      name: 'submit-wallets',
      run: (opts: Record<string, unknown>) =>
        submitWallets({ file: walletsFixture, env: 'local', ...opts } as never),
      wrongFn: 'quoteRegistration',
      wrongAddress: WALLET_REGISTRY,
    },
    {
      name: 'submit-transactions',
      run: (opts: Record<string, unknown>) =>
        submitTransactions({ file: transactionsFixture, env: 'local', ...opts } as never),
      wrongFn: 'quoteRegistration',
      wrongAddress: TRANSACTION_REGISTRY,
    },
    {
      name: 'submit-contracts',
      run: (opts: Record<string, unknown>) =>
        submitContracts({ file: contractsFixture, env: 'local', ...opts } as never),
      wrongFn: 'currentFeeWei',
      wrongAddress: FEE_MANAGER,
    },
  ] as const;

  for (const c of cases) {
    describe(c.name, () => {
      // The exact regression: an OperatorSubmitter batch call must not be priced with the
      // per-registration fee read off a registry / FeeManager.
      it('reads quoteBatchFee off OperatorSubmitter and nothing else', async () => {
        await c.run({ buildOnly: true });

        expectOperatorBatchQuote(theQuote());
        expect(readCalls.map((r) => r.functionName)).not.toContain(c.wrongFn);
        expect(readCalls.map((r) => r.address)).not.toContain(c.wrongAddress);
      });

      // The quoted wei must be what a multisig is asked to send — a correct quote that is
      // then discarded is the same production failure.
      it('puts the batch fee in the --build-only multisig value', async () => {
        await c.run({ buildOnly: true });

        const tx = capturedMultisigJson();
        expect(tx.value).toBe(BATCH_FEE.toString());
        expect(tx.value).not.toBe(REGISTRATION_FEE.toString());
        expect(tx.to).toBe(OPERATOR_SUBMITTER);
      });

      // `yes: true` skips the V16 confirmation prompt, which would otherwise throw here
      // because vitest's stdin is not a TTY. That refusal is asserted in safety.test.ts.
      it('puts the batch fee in the live submission value', async () => {
        await c.run({ privateKey: TEST_KEY, yes: true });

        expect(writeCalls).toHaveLength(1);
        expect(writeCalls[0].value).toBe(BATCH_FEE);
        expect(writeCalls[0].address).toBe(OPERATOR_SUBMITTER);
        expect(writeCalls[0].abi).toBe(OperatorSubmitterABI);
      });

      // Audit V16: the confirmation gate has to sit on the real submit path, not just in
      // safety.ts. Without `--yes` and without a TTY the command must abort BEFORE
      // writeContract — a batch that reached the chain and then failed to confirm is
      // exactly the irreversible outcome the gate exists to prevent.
      it('does not write without --yes when the confirmation cannot be shown', async () => {
        await expect(c.run({ privateKey: TEST_KEY })).rejects.toThrow(/not a TTY/);
        expect(writeCalls).toHaveLength(0);
      });
    });
  }
});

describe('quote command reads the right contract per type', () => {
  // Individuals pay the registry's per-registration fee; operators pay the batch fee. The
  // wallet/transaction quote must surface BOTH, sourced from the right contracts.
  it('wallet: individual fee from WalletRegistry + batch fee from OperatorSubmitter', async () => {
    await quote({ env: 'local', type: 'wallet' });

    expect(readCalls).toHaveLength(2);
    expect(readCalls[0]).toMatchObject({
      address: WALLET_REGISTRY,
      functionName: 'quoteRegistration',
    });
    expect(readCalls[0].abi).toBe(WalletRegistryABI);
    expectOperatorBatchQuote(readCalls[1]);
  });

  it('transaction: individual fee from TransactionRegistry + batch fee from OperatorSubmitter', async () => {
    await quote({ env: 'local', type: 'transaction' });

    expect(readCalls).toHaveLength(2);
    expect(readCalls[0]).toMatchObject({
      address: TRANSACTION_REGISTRY,
      functionName: 'quoteRegistration',
    });
    expect(readCalls[0].abi).toBe(TransactionRegistryABI);
    expectOperatorBatchQuote(readCalls[1]);
  });

  // The contract registry is operator-only — there is no individual price to show, and
  // reading FeeManager.currentFeeWei() here (the original bug) reports a different figure.
  it('contract: batch fee only, never FeeManager.currentFeeWei', async () => {
    await quote({ env: 'local', type: 'contract' });

    expect(readCalls).toHaveLength(1);
    expectOperatorBatchQuote(readCalls[0]);
    expect(readCalls.map((r) => r.functionName)).not.toContain('currentFeeWei');
    expect(readCalls.map((r) => r.address)).not.toContain(FEE_MANAGER);
  });
});
