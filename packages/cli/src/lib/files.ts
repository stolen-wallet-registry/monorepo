import { readFile } from 'fs/promises';
import { parse as parseCSV } from 'csv-parse/sync';
import { isAddress, isHash, zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { chainIdToBytes32, caip2ToBytes32, isValidCAIP2 } from './caip.js';

/**
 * Every parsed entry carries the chain it is REPORTED ON, in two forms.
 *
 * `chainId` is the keccak256 hash of the CAIP-2 string, which is what goes on chain and is
 * therefore unreadable. `reportedChain` keeps the human-readable CAIP-2 string beside it so the
 * confirmation prompt can show the operator which chain the batch actually accuses — the thing
 * `-c/--chain-id` controls and the thing that used to be invisible (audit S-4).
 *
 * `chainIdDefaulted` records that the row had NO chainId of its own and inherited the CLI
 * default. Without it the warning cannot be honest: "defaulted to eip155:8453" printed for a
 * file that explicitly said `eip155:8453` in every row is noise, and printed for nothing at all
 * is the wrong-chain mass registration this flag exists to make visible.
 */
export interface ParsedEntryChain {
  /** keccak256(CAIP-2 string) — the on-chain form. */
  chainId: Hex;
  /** CAIP-2 string, e.g. `eip155:10`. */
  reportedChain: string;
  /** True when the row omitted chainId and the CLI default was applied. */
  chainIdDefaulted: boolean;
}

export interface WalletEntry extends ParsedEntryChain {
  address: Address;
}

export interface TransactionEntry extends ParsedEntryChain {
  txHash: Hex;
}

export interface ContractEntry extends ParsedEntryChain {
  address: Address;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE FORMATS
// ═══════════════════════════════════════════════════════════════════════════

interface WalletFileEntry {
  address: string;
  chainId?: string | number; // Optional, defaults to Base
}

interface TransactionFileEntry {
  txHash: string;
  chainId?: string | number;
}

interface ContractFileEntry {
  address: string;
  chainId?: string | number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read a wallet/transaction/contract file and return its rows.
 *
 * The `Array.isArray` assertion is not defensive padding: a perfectly plausible export shape
 * (`{"wallets": [...]}`) previously reached `entries.map` and died with
 * "entries.map is not a function" — no file name, no hint about the shape expected. An operator
 * reading that has no reason to suspect their JSON wrapper.
 */
async function readEntryFile<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  let entries: unknown;

  if (ext === 'json') {
    try {
      entries = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else if (ext === 'csv') {
    entries = parseCSV(content, { columns: true, skip_empty_lines: true });
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  if (!Array.isArray(entries)) {
    throw new Error(
      `${filePath} must contain a JSON array of entries, not ${describeShape(entries)}. ` +
        'Expected e.g. [{"address": "0x...", "chainId": 8453}] — if your export wraps the rows ' +
        'in an object, unwrap that key first.'
    );
  }

  return entries as T[];
}

function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return keys.length > 0 ? `an object with keys [${keys.slice(0, 5).join(', ')}]` : 'an object';
  }
  return `a ${typeof value}`;
}

/**
 * Resolve one row's reported chain.
 *
 * Three deliberate behaviours, all of which used to be silent:
 *
 *  - A LITERAL ZERO is an error, not a default. The old check was `e.chainId ? ... : default`,
 *    so `chainId: 0` (and `"0"` after `Number`-ish coercion elsewhere) took the Base default
 *    without a word. A zero chain id is never meaningful and is exactly what a broken export
 *    emits for an empty numeric column.
 *  - A NON-NUMERIC cell is reported WITH ITS ROW INDEX. `BigInt("n/a")` throws a bare
 *    `SyntaxError: Cannot convert n/a to a BigInt` with no idea which of 800 rows produced it,
 *    while the address/hash errors beside it have always named the index.
 *  - An ABSENT cell records `chainIdDefaulted`, so the caller can say how many rows inherited
 *    the default instead of implying the file said so.
 */
function resolveEntryChain(
  raw: string | number | undefined | null,
  index: number,
  defaultChainId: bigint
): ParsedEntryChain {
  // CSV gives '' for a column present but empty; JSON gives undefined for an absent key.
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return {
      chainId: chainIdToBytes32(defaultChainId),
      reportedChain: `eip155:${defaultChainId}`,
      chainIdDefaulted: true,
    };
  }

  if (typeof raw === 'string' && raw.includes(':')) {
    const caip2 = raw.trim();
    if (!isValidCAIP2(caip2)) {
      throw new Error(
        `Invalid chainId at index ${index}: "${raw}" is not a valid CAIP-2 identifier ` +
          '(expected e.g. "eip155:10").'
      );
    }
    return { chainId: caip2ToBytes32(caip2), reportedChain: caip2, chainIdDefaulted: false };
  }

  let numeric: bigint;
  try {
    numeric = BigInt(typeof raw === 'string' ? raw.trim() : raw);
  } catch {
    throw new Error(
      `Invalid chainId at index ${index}: "${raw}" is not a number or a CAIP-2 identifier ` +
        '(expected e.g. 10 or "eip155:10").'
    );
  }

  if (numeric <= 0n) {
    throw new Error(
      `Invalid chainId at index ${index}: ${raw}. Chain IDs start at 1 — a zero or negative ` +
        'value is almost always an empty column in an export, and defaulting it would register ' +
        'these entries against the wrong chain.'
    );
  }

  return {
    chainId: chainIdToBytes32(numeric),
    reportedChain: `eip155:${numeric}`,
    chainIdDefaulted: false,
  };
}

/**
 * Reject the zero address / zero hash.
 *
 * viem's `isAddress`/`isHash` accept them — they are well-formed — but `OperatorSubmitter` SKIPS
 * zero entries on chain. A file of nothing but zeros therefore pays the batch fee, registers
 * nothing, and reports 800 registrations: it walks straight through the empty-batch guard in
 * `safety.ts` because the count is not zero, only the effect is.
 */
function assertNonZeroIdentifier(value: string, index: number, kind: 'address' | 'tx hash'): void {
  const zero = kind === 'address' ? zeroAddress : zeroHash;
  if (value.toLowerCase() === zero) {
    throw new Error(
      `Zero ${kind} at index ${index}. Zero entries are skipped on chain, so they would be ` +
        'paid for and registered as nothing — fix or remove the row.'
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════

export async function parseWalletFile(
  filePath: string,
  defaultChainId: bigint = 8453n // Base
): Promise<WalletEntry[]> {
  const entries = await readEntryFile<WalletFileEntry>(filePath);

  return entries.map((e, i) => {
    if (!isAddress(e.address)) {
      throw new Error(`Invalid address at index ${i}: ${e.address}`);
    }
    assertNonZeroIdentifier(e.address, i, 'address');

    return {
      address: e.address as Address,
      ...resolveEntryChain(e.chainId, i, defaultChainId),
    };
  });
}

export async function parseTransactionFile(
  filePath: string,
  defaultChainId: bigint = 8453n
): Promise<TransactionEntry[]> {
  const entries = await readEntryFile<TransactionFileEntry>(filePath);

  return entries.map((e, i) => {
    // Coerce to string for CSV-parsed values and validate with viem's isHash
    const txHashString = String(e.txHash);
    if (!isHash(txHashString)) {
      throw new Error(`Invalid tx hash at index ${i}: ${e.txHash}`);
    }
    assertNonZeroIdentifier(txHashString, i, 'tx hash');

    return {
      txHash: txHashString as Hex,
      ...resolveEntryChain(e.chainId, i, defaultChainId),
    };
  });
}

export async function parseContractFile(
  filePath: string,
  defaultChainId: bigint = 8453n
): Promise<ContractEntry[]> {
  const entries = await readEntryFile<ContractFileEntry>(filePath);

  return entries.map((e, i) => {
    if (!isAddress(e.address)) {
      throw new Error(`Invalid address at index ${i}: ${e.address}`);
    }
    assertNonZeroIdentifier(e.address, i, 'address');

    return {
      address: e.address as Address,
      ...resolveEntryChain(e.chainId, i, defaultChainId),
    };
  });
}
