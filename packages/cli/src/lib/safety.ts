import chalk from 'chalk';
import { promptLine } from './prompt.js';

/**
 * Blast-radius controls for operator batch submission (security audit V16 — Medium).
 *
 * Every `submit-*` command writes permanent, publicly visible fraud accusations about third
 * parties. Before this module the only guard was format validation: a well-formed but WRONG
 * file — wrong path, wrong chain, a spreadsheet export with the header row duplicated a
 * thousand times — went straight to `writeContract` with no summary, no confirmation, and no
 * size limit. The three rails here are, in the order they run:
 *
 *   1. `enforceBatchLimits` — reject empty batches and batches too large to fit in a block.
 *   2. duplicate detection    — reject (or, with `--dedupe`, drop) repeated identifiers.
 *   3. `confirmSubmission`    — show what is about to happen and require a typed answer.
 *
 * Rails 1 and 2 run in every mode, including `--build-only` and `--dry-run`: a file that
 * cannot be submitted safely should not be handed to a multisig either, and `--dry-run` is
 * only useful if it fails on the same inputs the real run would. Rail 3 is specific to direct
 * submission — `--build-only` produces a transaction a multisig reviews independently, and
 * `--dry-run` writes nothing.
 */

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SIZE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default maximum entries per batch.
 *
 * Derived from measured on-chain cost (`packages/contracts/test/GasMeasurement.t.sol`):
 * ~26,200 gas per wallet entry, ~26,200 per transaction entry, ~26,825 per contract entry.
 * Against a 25,000,000-gas transaction ceiling the tightest case (contracts) fits
 * 25,000,000 / 26,825 ≈ 932 entries before any allowance for calldata, the 21,000 intrinsic
 * cost, the fee transfer, or block-builder margin.
 *
 * 800 leaves roughly 3.5M gas of headroom, which is the batch size the project recommends.
 */
export const DEFAULT_MAX_BATCH_SIZE = 800;

/**
 * Hard ceiling that `--max-batch-size` cannot exceed.
 *
 * 950 entries × 26,825 gas ≈ 25.5M — already past a 25M-gas transaction for contract
 * batches. Anything above this cannot land, so accepting it would only convert a fast local
 * error into a slow on-chain revert that still costs gas.
 */
export const ABSOLUTE_MAX_BATCH_SIZE = 950;

export interface BatchLimitOptions {
  /** Entries parsed from the input file. */
  count: number;
  /** Operator override, if `--max-batch-size` was passed. */
  maxBatchSize?: number;
  /** Plural noun for messages: 'wallets', 'transactions', 'contracts'. */
  label: string;
}

/**
 * Reject empty and oversized batches. Throws with an actionable message; returns nothing.
 *
 * The empty case matters independently of gas: `OperatorSubmitter` charges the flat per-batch
 * fee before it looks at the array length, so a zero-entry batch is a pure loss (audit V8).
 */
export function enforceBatchLimits({ count, maxBatchSize, label }: BatchLimitOptions): void {
  if (count === 0) {
    throw new Error(
      `Input file contains no ${label}. Nothing would be registered, but the batch fee is ` +
        'charged regardless — refusing to submit an empty batch.'
    );
  }

  const limit = resolveMaxBatchSize(maxBatchSize);

  if (count > limit) {
    throw new Error(
      `Batch of ${count} ${label} exceeds the maximum of ${limit}. ` +
        `At ~26,825 gas per entry a batch this large risks exceeding the 25M gas ` +
        `transaction ceiling and reverting after the fee is paid. ` +
        `Split the input file into batches of ${DEFAULT_MAX_BATCH_SIZE} or fewer` +
        (limit < ABSOLUTE_MAX_BATCH_SIZE
          ? `, or raise the limit with --max-batch-size (hard ceiling ${ABSOLUTE_MAX_BATCH_SIZE}).`
          : '.')
    );
  }
}

/** Validate and clamp an operator-supplied `--max-batch-size`. */
export function resolveMaxBatchSize(maxBatchSize: number | undefined): number {
  if (maxBatchSize === undefined) return DEFAULT_MAX_BATCH_SIZE;

  if (!Number.isInteger(maxBatchSize) || maxBatchSize <= 0) {
    throw new Error(`Invalid --max-batch-size: ${maxBatchSize}. Expected a positive integer.`);
  }

  if (maxBatchSize > ABSOLUTE_MAX_BATCH_SIZE) {
    throw new Error(
      `--max-batch-size ${maxBatchSize} exceeds the hard ceiling of ${ABSOLUTE_MAX_BATCH_SIZE}. ` +
        'A batch that large cannot fit in a 25M gas transaction and would revert on chain.'
    );
  }

  return maxBatchSize;
}

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export interface DuplicateGroup {
  /** Normalised key that collided, formatted for display. */
  key: string;
  /** Zero-based indices in the input file, in order. */
  indices: number[];
}

export interface DedupeResult<T> {
  entries: T[];
  duplicates: DuplicateGroup[];
}

/**
 * Find repeated entries by `(identifier, chainId)`.
 *
 * Identity is case-insensitive on the identifier because addresses and tx hashes arrive from
 * spreadsheets in mixed EIP-55 and lowercase form; the same wallet in both forms is one entry
 * on chain. chainId is part of the key because the same address on two chains is genuinely two
 * registrations.
 *
 * Duplicates are never merely wasteful: `OperatorSubmitter` skips already-registered entries,
 * so a file that is 90% duplicates silently registers far less than the operator was told, and
 * the reported count no longer matches reality.
 */
export function findDuplicates<T>(
  entries: readonly T[],
  keyOf: (entry: T) => string
): DuplicateGroup[] {
  const seen = new Map<string, number[]>();

  entries.forEach((entry, index) => {
    const key = keyOf(entry).toLowerCase();
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, [index]);
    } else {
      existing.push(index);
    }
  });

  const duplicates: DuplicateGroup[] = [];
  for (const [key, indices] of seen) {
    if (indices.length > 1) duplicates.push({ key, indices });
  }
  return duplicates;
}

/**
 * Apply the duplicate policy.
 *
 * Default is fail-closed: a file with duplicates is very often a file that was assembled
 * wrongly, and refusing it is cheap while an irreversible defamatory batch is not. `--dedupe`
 * opts into keeping the first occurrence of each key and dropping the rest, and says so on
 * stderr so the discrepancy between the file's line count and the submitted count is visible.
 */
export function applyDuplicatePolicy<T>(
  entries: readonly T[],
  keyOf: (entry: T) => string,
  options: { dedupe?: boolean; label: string }
): DedupeResult<T> {
  const duplicates = findDuplicates(entries, keyOf);

  if (duplicates.length === 0) {
    return { entries: [...entries], duplicates };
  }

  if (!options.dedupe) {
    const sample = duplicates
      .slice(0, 5)
      .map((d) => `  ${d.key} — rows ${d.indices.map((i) => i + 1).join(', ')}`)
      .join('\n');
    const more =
      duplicates.length > 5 ? `\n  ...and ${duplicates.length - 5} more duplicated keys` : '';
    throw new Error(
      `Input file contains ${duplicates.length} duplicated ${options.label} ` +
        `(same identifier and chain more than once):\n${sample}${more}\n` +
        'Duplicates are skipped on chain, so the registered count would not match the file. ' +
        'Fix the input, or pass --dedupe to keep the first occurrence of each.'
    );
  }

  const kept: T[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = keyOf(entry).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }

  return { entries: kept, duplicates };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfirmSubmissionOptions {
  env: 'local' | 'testnet' | 'mainnet';
  /** 'wallets' | 'transactions' | 'contracts' */
  label: string;
  count: number;
  chainName: string;
  chainId: number;
  contractAddress: string;
  /** Human-readable batch fee, already formatted. */
  fee: string;
  /** A few identifiers to show, so a wrong file is visible before it lands. */
  sample: string[];
  /** `--yes`: skip the prompt entirely (scripted use). */
  assumeYes?: boolean;
  /** Injected in tests. */
  prompt?: (question: string) => Promise<string>;
  /** Injected in tests. */
  write?: (line: string) => void;
}

/**
 * Show what is about to be written and require a typed answer.
 *
 * On mainnet the required answer is the entry count rather than "yes". Typing a number the
 * operator has to read off the summary is the only part of this that actually defends against
 * the V16 scenario — pointing the command at the wrong file. A reflexive "y" does not.
 *
 * `--yes` skips the prompt for scripted use. That is a deliberate escape hatch, not an
 * oversight: operators run these commands from pipelines, and a prompt that cannot be bypassed
 * gets bypassed by `yes |` instead, which is strictly worse.
 */
export async function confirmSubmission(options: ConfirmSubmissionOptions): Promise<void> {
  const write = options.write ?? ((line: string) => console.log(line));
  const ask = options.prompt ?? promptLine;

  const banner = options.env === 'mainnet' ? chalk.red.bold : chalk.yellow.bold;

  write('');
  write(banner('  ─── CONFIRM BATCH SUBMISSION ───'));
  write(`  Environment:  ${options.env}`);
  write(`  Chain:        ${options.chainName} (${options.chainId})`);
  write(`  Contract:     ${options.contractAddress}`);
  write(`  Registering:  ${chalk.bold(String(options.count))} ${options.label}`);
  write(`  Batch fee:    ${options.fee}`);
  if (options.sample.length > 0) {
    write(`  First entries:`);
    for (const entry of options.sample) write(`    ${entry}`);
    if (options.count > options.sample.length) {
      write(`    ...and ${options.count - options.sample.length} more`);
    }
  }
  write(chalk.gray('  This is irreversible: entries cannot be removed once registered on chain.'));
  write('');

  if (options.assumeYes) {
    write(chalk.gray('  --yes supplied; skipping confirmation.'));
    return;
  }

  const expected = options.env === 'mainnet' ? String(options.count) : 'yes';
  const question =
    options.env === 'mainnet'
      ? `  Type the number of ${options.label} to confirm (${options.count}): `
      : `  Type "yes" to submit: `;

  const answer = await ask(question);

  if (answer !== expected) {
    throw new Error('Submission cancelled — confirmation did not match.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYS
// ═══════════════════════════════════════════════════════════════════════════

/** Duplicate key for an address-shaped entry (wallets, contracts). */
export function addressEntryKey(entry: { address: string; chainId: string }): string {
  return `${entry.address}@${entry.chainId}`;
}

/** Duplicate key for a transaction entry. */
export function transactionEntryKey(entry: { txHash: string; chainId: string }): string {
  return `${entry.txHash}@${entry.chainId}`;
}
