import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { chainIdToBytes32, caip2ToBytes32 } from '../src/lib/caip.js';
import { parseWalletFile, parseTransactionFile, parseContractFile } from '../src/lib/files.js';

/**
 * Round-3 review S-4 and its neighbours.
 *
 * These parsers decide what a batch permanently ACCUSES, and every gap below was silent: a
 * literal `chainId: 0` took the Base default without a word, a wrapped JSON export died with
 * "entries.map is not a function", a non-numeric chainId threw a bare `SyntaxError` with no row
 * index while the address error beside it named one, and the zero address passed validation
 * only to be skipped on chain — paying the batch fee to register nothing while the count said
 * 800.
 */

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'swr-files-test-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

let counter = 0;
async function fixture(extension: 'json' | 'csv', content: string): Promise<string> {
  const path = join(dir, `f${counter++}.${extension}`);
  await writeFile(path, content);
  return path;
}

const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const TX = '0x'.padEnd(66, '1') as `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════
// REPORTED CHAIN
// ═══════════════════════════════════════════════════════════════════════════

describe('reported chain resolution', () => {
  it('applies the default and says so when the row has no chainId', async () => {
    const file = await fixture('json', JSON.stringify([{ address: WALLET }]));
    const [entry] = await parseWalletFile(file, 10n);

    expect(entry!.chainId).toBe(chainIdToBytes32(10n));
    expect(entry!.reportedChain).toBe('eip155:10');
    // The flag is what lets the confirmation prompt distinguish "the file said Base" from
    // "nobody said anything and we picked Base" — the whole of S-4.
    expect(entry!.chainIdDefaulted).toBe(true);
  });

  it('does not mark an explicit chainId as defaulted', async () => {
    const file = await fixture('json', JSON.stringify([{ address: WALLET, chainId: 10 }]));
    const [entry] = await parseWalletFile(file, 8453n);

    expect(entry!.reportedChain).toBe('eip155:10');
    expect(entry!.chainIdDefaulted).toBe(false);
  });

  it('accepts a CAIP-2 chainId and keeps it verbatim', async () => {
    const file = await fixture(
      'json',
      JSON.stringify([{ address: WALLET, chainId: 'eip155:42161' }])
    );
    const [entry] = await parseWalletFile(file, 8453n);

    expect(entry!.chainId).toBe(caip2ToBytes32('eip155:42161'));
    expect(entry!.reportedChain).toBe('eip155:42161');
    expect(entry!.chainIdDefaulted).toBe(false);
  });

  // Excel and Google Sheets prefix a UTF-8 BOM (U+FEFF) to their CSV exports, and csv-parse
  // defaults to `bom: false` — which leaves it glued to the front of the first header, so the
  // `address` column parses under a key that is not `address`. Every row then reports an
  // undefined address and the run aborts on row 0 of a file whose row 0 is fine, sending the
  // operator hunting a data bug that does not exist. This guards the one-word `bom: true`
  // option that fixes it; deleting it fails here.
  it('parses a CSV that starts with a UTF-8 BOM (spreadsheet export)', async () => {
    // \uFEFF rather than a literal BOM: the character is invisible in an editor and trips
    // eslint's no-irregular-whitespace, so writing it as an escape is both readable and lintable.
    const file = await fixture('csv', `\uFEFFaddress,chainId\n${WALLET},42161\n`);
    const [entry] = await parseWalletFile(file, 8453n);

    expect(entry!.address).toBe(WALLET);
    expect(entry!.reportedChain).toBe('eip155:42161');
  });

  // CSV gives '' for a column that exists but is empty — the shape of a spreadsheet export
  // with a header row and no values. That is genuinely "absent", not an error.
  it('treats an empty CSV cell as absent', async () => {
    const file = await fixture('csv', `address,chainId\n${WALLET},\n`);
    const [entry] = await parseWalletFile(file, 8453n);

    expect(entry!.reportedChain).toBe('eip155:8453');
    expect(entry!.chainIdDefaulted).toBe(true);
  });

  // The old check was `e.chainId ? ... : default`, so a literal 0 was falsy and inherited the
  // default in silence. A zero chain id is never meaningful; it is what a broken export emits.
  it('rejects a literal zero chainId rather than defaulting it', async () => {
    const json = await fixture('json', JSON.stringify([{ address: WALLET, chainId: 0 }]));
    await expect(parseWalletFile(json, 8453n)).rejects.toThrow(/Invalid chainId at index 0/);

    const csv = await fixture('csv', `address,chainId\n${WALLET},0\n`);
    await expect(parseWalletFile(csv, 8453n)).rejects.toThrow(/Invalid chainId at index 0/);
  });

  // BigInt('n/a') throws `SyntaxError: Cannot convert n/a to a BigInt` — no row index, in a
  // file that may have 800 rows, while the address error one line above has always named one.
  it('names the row index for a non-numeric chainId', async () => {
    const file = await fixture(
      'json',
      JSON.stringify([
        { address: WALLET, chainId: 8453 },
        { address: WALLET, chainId: 'n/a' },
      ])
    );
    await expect(parseWalletFile(file, 8453n)).rejects.toThrow(/Invalid chainId at index 1/);
  });

  it('rejects a malformed CAIP-2 identifier with its row index', async () => {
    const file = await fixture('json', JSON.stringify([{ address: WALLET, chainId: 'eip155:' }]));
    await expect(parseWalletFile(file, 8453n)).rejects.toThrow(/index 0/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FILE SHAPE
// ═══════════════════════════════════════════════════════════════════════════

describe('file shape validation', () => {
  // The plausible wrong shape: an export that wraps the rows in a key.
  it('rejects a JSON object instead of an array, naming the file and the keys', async () => {
    const file = await fixture('json', JSON.stringify({ wallets: [{ address: WALLET }] }));
    const error = await parseWalletFile(file, 8453n).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(file);
    expect((error as Error).message).toContain('wallets');
    expect((error as Error).message).not.toContain('is not a function');
  });

  it('rejects invalid JSON with the file name attached', async () => {
    const file = await fixture('json', '{not json');
    await expect(parseWalletFile(file, 8453n)).rejects.toThrow(/is not valid JSON/);
  });

  it('still rejects an unsupported extension', async () => {
    const file = join(dir, 'entries.txt');
    await writeFile(file, '[]');
    await expect(parseWalletFile(file, 8453n)).rejects.toThrow(/Unsupported file format/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ZERO IDENTIFIERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * viem accepts the zero address and the zero hash — they are well-formed. `OperatorSubmitter`
 * SKIPS them on chain. So a file of nothing but zeros paid the batch fee, registered nothing,
 * and walked straight through `enforceBatchLimits`' empty-batch guard, because the count was
 * never zero — only the effect was.
 */
describe('zero identifiers', () => {
  it('rejects the zero address in a wallet file', async () => {
    const file = await fixture(
      'json',
      JSON.stringify([
        { address: WALLET, chainId: 8453 },
        { address: '0x0000000000000000000000000000000000000000', chainId: 8453 },
      ])
    );
    await expect(parseWalletFile(file, 8453n)).rejects.toThrow(/Zero address at index 1/);
  });

  it('rejects the zero address in a contract file', async () => {
    const file = await fixture(
      'json',
      JSON.stringify([{ address: '0x0000000000000000000000000000000000000000', chainId: 8453 }])
    );
    await expect(parseContractFile(file, 8453n)).rejects.toThrow(/Zero address at index 0/);
  });

  it('rejects the zero hash in a transaction file', async () => {
    const file = await fixture(
      'json',
      JSON.stringify([{ txHash: `0x${'0'.repeat(64)}`, chainId: 8453 }])
    );
    await expect(parseTransactionFile(file, 8453n)).rejects.toThrow(/Zero tx hash at index 0/);
  });

  it('accepts a real identifier beside the check', async () => {
    const file = await fixture('json', JSON.stringify([{ txHash: TX, chainId: 8453 }]));
    const [entry] = await parseTransactionFile(file, 8453n);
    expect(entry!.txHash).toBe(TX);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXISTING BEHAVIOUR PRESERVED
// ═══════════════════════════════════════════════════════════════════════════

describe('all three parsers agree on chain handling', () => {
  it('parses the committed contracts fixtures identically from CSV and JSON', async () => {
    const fromJson = await parseContractFile('test/fixtures/contracts.json', 8453n);
    const fromCsv = await parseContractFile('test/fixtures/contracts.csv', 8453n);

    expect(fromJson.map((e) => e.chainId)).toEqual(fromCsv.map((e) => e.chainId));
    expect(fromJson.every((e) => !e.chainIdDefaulted)).toBe(true);
  });

  it('applies the default per parser', async () => {
    const wallets = await fixture('json', JSON.stringify([{ address: WALLET }]));
    const contracts = await fixture('json', JSON.stringify([{ address: WALLET }]));
    const transactions = await fixture('json', JSON.stringify([{ txHash: TX }]));

    for (const entry of [
      (await parseWalletFile(wallets, 42161n))[0]!,
      (await parseContractFile(contracts, 42161n))[0]!,
      (await parseTransactionFile(transactions, 42161n))[0]!,
    ]) {
      expect(entry.reportedChain).toBe('eip155:42161');
      expect(entry.chainIdDefaulted).toBe(true);
    }
  });
});
