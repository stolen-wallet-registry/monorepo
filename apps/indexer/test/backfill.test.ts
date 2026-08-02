import { describe, it, expect } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  selectBackfillTargets,
  transactionBackfillValues,
  walletBackfillValues,
} from '../src/lib/backfill';

/**
 * SCOPE. `selectBackfillTargets` models the `WHERE transactionHash = ? AND batchId IS NULL`
 * clause the handlers issue through drizzle; it is not the query itself, and there is no
 * ponder test harness in this repo to run the real one against a database. The value builders
 * below ARE the shipped code path (`src/index.ts` calls them).
 */

const TX_A = '0xaaaa' as Hex;
const TX_B = '0xbbbb' as Hex;
const OPERATOR = '0x742d35cc6634c0532925a3b844bc454e83c4b3a1' as Address;

describe('selectBackfillTargets', () => {
  it('claims every unclaimed entry sharing the batch transaction', () => {
    const rows = [
      { transactionHash: TX_A, batchId: null },
      { transactionHash: TX_A, batchId: null },
      { transactionHash: TX_B, batchId: null },
    ];
    expect(selectBackfillTargets(rows, TX_A)).toHaveLength(2);
  });

  it('leaves entries from other transactions alone', () => {
    const rows = [{ transactionHash: TX_B, batchId: null }];
    expect(selectBackfillTargets(rows, TX_A)).toEqual([]);
  });

  /**
   * The reason the isNull guard exists. Every registry call emits one batch summary per tx
   * today, so matching on transactionHash alone would be correct by accident. If a tx ever
   * carries two batches — batched bridge delivery is the plausible route — the second summary
   * must not re-tag the first batch's entries, which would silently corrupt BOTH batches:
   * batch 1 loses entries it owns and batch 2 gains entries it does not.
   */
  it('never re-tags entries a previous batch in the same tx already claimed', () => {
    const rows = [
      { transactionHash: TX_A, batchId: '1' },
      { transactionHash: TX_A, batchId: '1' },
      { transactionHash: TX_A, batchId: null },
    ];

    const claimed = selectBackfillTargets(rows, TX_A);

    expect(claimed).toHaveLength(1);
    expect(claimed.every((row) => row.batchId === null)).toBe(true);
  });

  it('is a no-op when a batch summary fires with no entries in its tx', () => {
    // Every wallet in the batch was already registered, so the contract emitted the summary
    // with actualCount 0 and no per-entry events reached the indexer.
    expect(selectBackfillTargets([], TX_A)).toEqual([]);
  });
});

describe('walletBackfillValues', () => {
  it('writes batchId as a string and the operator address', () => {
    expect(walletBackfillValues(42n, OPERATOR)).toEqual({ batchId: '42', operator: OPERATOR });
  });

  // batchId is uint256 on the event and t.text() in the schema; a bigint that overflows
  // Number must survive the conversion intact.
  it('does not lose precision on a large uint256 batch id', () => {
    const huge = 2n ** 200n;
    expect(walletBackfillValues(huge, OPERATOR).batchId).toBe(huge.toString());
  });

  it('accepts an already-stringified batch id', () => {
    expect(walletBackfillValues('7', OPERATOR).batchId).toBe('7');
  });
});

describe('transactionBackfillValues', () => {
  it('writes only batchId', () => {
    expect(transactionBackfillValues(9n)).toEqual({ batchId: '9' });
  });

  // Guards the asymmetry with the wallet path: transactionInBatch.reporter is populated per
  // entry (and is 0x0 for operator submissions), so the back-fill must not invent an operator
  // column here.
  it('does not write an operator column', () => {
    expect(Object.keys(transactionBackfillValues(9n))).toEqual(['batchId']);
  });
});
