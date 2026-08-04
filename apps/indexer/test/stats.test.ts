import { describe, it, expect } from 'vitest';
import { applyStatsDelta, EMPTY_STATS } from '../src/lib/stats';

describe('applyStatsDelta', () => {
  it('seeds from zero when no row exists', () => {
    const next = applyStatsDelta(null, { walletRegistrations: 1, sponsored: 1 }, 100n);
    expect(next.totalWalletRegistrations).toBe(1);
    expect(next.sponsoredRegistrations).toBe(1);
    expect(next.directRegistrations).toBe(0);
    expect(next.lastUpdated).toBe(100n);
  });

  it('keeps directRegistrations derived, never accumulated', () => {
    let stats = applyStatsDelta(null, { walletRegistrations: 3, sponsored: 1 }, 1n);
    stats = applyStatsDelta(stats, { walletRegistrations: 2, sponsored: 0 }, 2n);
    expect(stats.totalWalletRegistrations).toBe(5);
    expect(stats.sponsoredRegistrations).toBe(1);
    expect(stats.directRegistrations).toBe(4);
  });

  // The F29 regression: the operator path incremented transactionsReported but not
  // transactionBatches, so "total batches" understated reality and the two counters
  // rendered side by side on the dashboard were incomparable.
  it('counts operator transaction batches in BOTH the total and the operator subset', () => {
    let stats = applyStatsDelta(null, { transactionBatches: 1, transactionsReported: 4 }, 1n);
    stats = applyStatsDelta(
      stats,
      { transactionBatches: 1, totalOperatorTransactionBatches: 1, transactionsReported: 10 },
      2n
    );
    expect(stats.totalTransactionBatches).toBe(2);
    expect(stats.totalOperatorTransactionBatches).toBe(1);
    expect(stats.totalTransactionsReported).toBe(14);
    // The operator subset can never exceed the total.
    expect(stats.totalOperatorTransactionBatches).toBeLessThanOrEqual(
      stats.totalTransactionBatches
    );
  });

  it('accumulates bigint donations', () => {
    let stats = applyStatsDelta(null, { supportSoulbounds: 1, supportDonations: 5n }, 1n);
    stats = applyStatsDelta(stats, { supportSoulbounds: 1, supportDonations: 7n }, 2n);
    expect(stats.supportSoulboundsMinted).toBe(2);
    expect(stats.totalSupportDonations).toBe(12n);
  });

  it('supports negative deltas (operator revocation)', () => {
    let stats = applyStatsDelta(null, { totalOperators: 1, activeOperators: 1 }, 1n);
    stats = applyStatsDelta(stats, { activeOperators: -1 }, 2n);
    expect(stats.totalOperators).toBe(1);
    expect(stats.activeOperators).toBe(0);
  });

  it('leaves untouched counters at their previous value', () => {
    const prev = { ...EMPTY_STATS, crossChainRegistrations: 9, walletSoulboundsMinted: 3 };
    const next = applyStatsDelta(prev, { walletRegistrations: 1 }, 42n);
    expect(next.crossChainRegistrations).toBe(9);
    expect(next.walletSoulboundsMinted).toBe(3);
    expect(next.lastUpdated).toBe(42n);
  });
});
