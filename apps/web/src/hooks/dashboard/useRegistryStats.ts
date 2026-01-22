/**
 * Hook to fetch global registry statistics from the Ponder indexer.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import { REGISTRY_STATS_QUERY, type RawRegistryStatsResponse } from '@swr/search';
import { logger } from '@/lib/logger';

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:42069';

export interface RegistryStats {
  /** Total stolen wallets registered */
  totalWalletRegistrations: number;
  /** Total transaction batches submitted */
  totalTransactionBatches: number;
  /** Sum of all transactions in batches */
  totalTransactionsReported: number;
  /** Sponsored (relay) registrations */
  sponsoredRegistrations: number;
  /** Direct registrations */
  directRegistrations: number;
  /** Cross-chain registrations */
  crossChainRegistrations: number;
  /** Wallet soulbound NFTs minted */
  walletSoulboundsMinted: number;
  /** Support soulbound NFTs minted */
  supportSoulboundsMinted: number;
  /** Total donations in wei */
  totalSupportDonations: bigint;
  /** Total operators ever approved */
  totalOperators: number;
  /** Currently active operators */
  activeOperators: number;
  /** Operator wallet batches */
  totalWalletBatches: number;
  /** Operator transaction batches */
  totalOperatorTransactionBatches: number;
  /** Fraudulent contract batches */
  totalContractBatches: number;
  /** Individual fraudulent contracts */
  totalFraudulentContracts: number;
  /** Invalidated contract batches */
  invalidatedContractBatches: number;
  /** Last update timestamp */
  lastUpdated: bigint;
}

export interface UseRegistryStatsResult {
  /** Registry statistics */
  stats: RegistryStats | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Fetch global registry statistics.
 *
 * @example
 * ```tsx
 * const { stats, isLoading } = useRegistryStats();
 *
 * if (stats) {
 *   console.log(`${stats.totalWalletRegistrations} wallets registered`);
 * }
 * ```
 */
export function useRegistryStats(): UseRegistryStatsResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async (): Promise<RegistryStats | null> => {
      logger.contract.debug('Fetching registry stats from indexer');

      const response = await request<RawRegistryStatsResponse>(INDEXER_URL, REGISTRY_STATS_QUERY);

      if (!response.registryStats) {
        logger.contract.warn('No registry stats found (indexer may not have processed events yet)');
        return null;
      }

      const raw = response.registryStats;

      const stats: RegistryStats = {
        totalWalletRegistrations: raw.totalWalletRegistrations,
        totalTransactionBatches: raw.totalTransactionBatches,
        totalTransactionsReported: raw.totalTransactionsReported,
        sponsoredRegistrations: raw.sponsoredRegistrations,
        directRegistrations: raw.directRegistrations,
        crossChainRegistrations: raw.crossChainRegistrations,
        walletSoulboundsMinted: raw.walletSoulboundsMinted,
        supportSoulboundsMinted: raw.supportSoulboundsMinted,
        totalSupportDonations: BigInt(raw.totalSupportDonations),
        totalOperators: raw.totalOperators,
        activeOperators: raw.activeOperators,
        totalWalletBatches: raw.totalWalletBatches,
        totalOperatorTransactionBatches: raw.totalOperatorTransactionBatches,
        totalContractBatches: raw.totalContractBatches,
        totalFraudulentContracts: raw.totalFraudulentContracts,
        invalidatedContractBatches: raw.invalidatedContractBatches,
        lastUpdated: BigInt(raw.lastUpdated),
      };

      logger.contract.info('Registry stats fetched', {
        wallets: stats.totalWalletRegistrations,
        contracts: stats.totalFraudulentContracts,
        operators: stats.activeOperators,
      });

      return stats;
    },
    staleTime: 30_000, // 30 seconds
    retry: 2,
  });

  return {
    stats: data ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
