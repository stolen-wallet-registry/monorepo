/**
 * Pure arithmetic for the global `registry_stats` row.
 *
 * Kept free of ponder imports so the counter semantics are unit testable — the previous
 * inline version silently let `totalTransactionBatches` diverge from
 * `totalTransactionsReported` (operator batches incremented the transaction count but not
 * the batch count) with nothing to catch it.
 */

export type StatsDelta = {
  walletRegistrations?: number;
  /**
   * ALL transaction batches — individual AND operator. `totalOperatorTransactionBatches`
   * is the operator-only subset, so `totalTransactionBatches` is a genuine total and its
   * ratio to `totalTransactionsReported` is meaningful.
   */
  transactionBatches?: number;
  transactionsReported?: number;
  sponsored?: number;
  crossChain?: number;
  walletSoulbounds?: number;
  supportSoulbounds?: number;
  supportDonations?: bigint;
  // Operator registry
  totalOperators?: number;
  activeOperators?: number;
  // Operator batch submissions (subsets of the totals above)
  totalWalletBatches?: number;
  totalOperatorTransactionBatches?: number;
  totalContractBatches?: number;
  totalFraudulentContracts?: number;
};

/** The mutable columns of `registry_stats` (everything except `id`). */
export type StatsRow = {
  totalWalletRegistrations: number;
  totalTransactionBatches: number;
  totalTransactionsReported: number;
  sponsoredRegistrations: number;
  directRegistrations: number;
  crossChainRegistrations: number;
  walletSoulboundsMinted: number;
  supportSoulboundsMinted: number;
  totalSupportDonations: bigint;
  totalOperators: number;
  activeOperators: number;
  totalWalletBatches: number;
  totalOperatorTransactionBatches: number;
  totalContractBatches: number;
  totalFraudulentContracts: number;
  lastUpdated: bigint;
};

export const EMPTY_STATS: StatsRow = {
  totalWalletRegistrations: 0,
  totalTransactionBatches: 0,
  totalTransactionsReported: 0,
  sponsoredRegistrations: 0,
  directRegistrations: 0,
  crossChainRegistrations: 0,
  walletSoulboundsMinted: 0,
  supportSoulboundsMinted: 0,
  totalSupportDonations: 0n,
  totalOperators: 0,
  activeOperators: 0,
  totalWalletBatches: 0,
  totalOperatorTransactionBatches: 0,
  totalContractBatches: 0,
  totalFraudulentContracts: 0,
  lastUpdated: 0n,
};

/**
 * Apply a delta to an existing stats row (or to zero, for the first event).
 *
 * `directRegistrations` is derived, never accumulated, so it can never drift from
 * `totalWalletRegistrations - sponsoredRegistrations`.
 */
export function applyStatsDelta(
  existing: StatsRow | null | undefined,
  delta: StatsDelta,
  timestamp: bigint
): StatsRow {
  const prev = existing ?? EMPTY_STATS;

  const totalWalletRegistrations = prev.totalWalletRegistrations + (delta.walletRegistrations ?? 0);
  const sponsoredRegistrations = prev.sponsoredRegistrations + (delta.sponsored ?? 0);

  return {
    totalWalletRegistrations,
    totalTransactionBatches: prev.totalTransactionBatches + (delta.transactionBatches ?? 0),
    totalTransactionsReported: prev.totalTransactionsReported + (delta.transactionsReported ?? 0),
    sponsoredRegistrations,
    directRegistrations: totalWalletRegistrations - sponsoredRegistrations,
    crossChainRegistrations: prev.crossChainRegistrations + (delta.crossChain ?? 0),
    walletSoulboundsMinted: prev.walletSoulboundsMinted + (delta.walletSoulbounds ?? 0),
    supportSoulboundsMinted: prev.supportSoulboundsMinted + (delta.supportSoulbounds ?? 0),
    totalSupportDonations: prev.totalSupportDonations + (delta.supportDonations ?? 0n),
    totalOperators: prev.totalOperators + (delta.totalOperators ?? 0),
    activeOperators: prev.activeOperators + (delta.activeOperators ?? 0),
    totalWalletBatches: prev.totalWalletBatches + (delta.totalWalletBatches ?? 0),
    totalOperatorTransactionBatches:
      prev.totalOperatorTransactionBatches + (delta.totalOperatorTransactionBatches ?? 0),
    totalContractBatches: prev.totalContractBatches + (delta.totalContractBatches ?? 0),
    totalFraudulentContracts: prev.totalFraudulentContracts + (delta.totalFraudulentContracts ?? 0),
    lastUpdated: timestamp,
  };
}
