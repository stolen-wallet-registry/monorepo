/**
 * Hook to fetch recent registrations across all registry types.
 *
 * Combines wallet, contract, and transaction registrations into a unified view.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import {
  RECENT_WALLETS_QUERY,
  RECENT_CONTRACTS_QUERY,
  RECENT_TRANSACTIONS_QUERY,
  type RawRecentWalletsResponse,
  type RawRecentContractsResponse,
  type RawRecentTransactionsResponse,
} from '@swr/search';
import { logger } from '@/lib/logger';
import type { Address, Hash } from '@/lib/types/ethereum';

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:42069';

/** Registration entry type */
export type RegistrationType = 'wallet' | 'contract' | 'transaction';

/** Unified registration entry */
export interface RegistrationEntry {
  /** Unique ID (address or batchId) */
  id: string;
  /** Registration type */
  type: RegistrationType;
  /** Address (for wallet/contract) or batch ID (for transaction) */
  identifier: string;
  /** CAIP-2 chain ID (e.g., "eip155:8453") */
  chainId: string;
  /** Operator address (if operator submission) */
  operator?: Address;
  /** Reporter address (if individual submission) */
  reporter?: Address;
  /** Whether it was sponsored/relayed */
  isSponsored: boolean;
  /** Registration timestamp (Unix seconds) */
  registeredAt: bigint;
  /** Transaction hash (not available for contract entries) */
  transactionHash?: Hash;
  /** Batch ID reference (for contract entries) */
  batchId?: string;
}

export interface UseRecentRegistrationsOptions {
  /** Filter by type (default: all) */
  type?: RegistrationType | 'all';
  /** Number of entries to fetch per type (default: 20) */
  limit?: number;
}

export interface UseRecentRegistrationsResult {
  /** Combined registration entries, sorted by time descending */
  registrations: RegistrationEntry[];
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
 * Fetch recent registrations across all registry types.
 *
 * @example
 * ```tsx
 * const { registrations, isLoading } = useRecentRegistrations({ limit: 50 });
 *
 * // Filter by type
 * const { registrations } = useRecentRegistrations({ type: 'wallet' });
 * ```
 */
export function useRecentRegistrations(
  options: UseRecentRegistrationsOptions = {}
): UseRecentRegistrationsResult {
  const { type = 'all', limit = 20 } = options;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'registrations', { type, limit }],
    queryFn: async (): Promise<RegistrationEntry[]> => {
      logger.contract.debug('Fetching recent registrations', { type, limit });

      const entries: RegistrationEntry[] = [];

      // Fetch based on filter
      const fetchWallets = type === 'all' || type === 'wallet';
      const fetchContracts = type === 'all' || type === 'contract';
      const fetchTransactions = type === 'all' || type === 'transaction';

      // Parallel fetch
      const [walletsRes, contractsRes, transactionsRes] = await Promise.all([
        fetchWallets
          ? request<RawRecentWalletsResponse>(INDEXER_URL, RECENT_WALLETS_QUERY, {
              limit,
              offset: 0,
            })
          : null,
        fetchContracts
          ? request<RawRecentContractsResponse>(INDEXER_URL, RECENT_CONTRACTS_QUERY, {
              limit,
              offset: 0,
            })
          : null,
        fetchTransactions
          ? request<RawRecentTransactionsResponse>(INDEXER_URL, RECENT_TRANSACTIONS_QUERY, {
              limit,
              offset: 0,
            })
          : null,
      ]);

      // Process wallets
      if (walletsRes) {
        for (const raw of walletsRes.stolenWallets.items) {
          // Extract chain ID from CAIP-10 (format: eip155:chainId:address)
          const caip10Parts = raw.caip10.split(':');
          let chainId: string;
          if (caip10Parts.length >= 2) {
            chainId = `${caip10Parts[0]}:${caip10Parts[1]}`;
          } else {
            logger.contract.debug('Fallback to eip155:1 for wallet', { caip10: raw.caip10 });
            chainId = 'eip155:1';
          }

          entries.push({
            id: raw.id,
            type: 'wallet',
            identifier: raw.id,
            chainId,
            operator: raw.operator as Address | undefined,
            isSponsored: raw.isSponsored,
            registeredAt: BigInt(raw.registeredAt),
            transactionHash: raw.transactionHash as Hash,
          });
        }
      }

      // Process contracts
      if (contractsRes) {
        for (const raw of contractsRes.fraudulentContracts.items) {
          entries.push({
            id: raw.id,
            type: 'contract',
            identifier: raw.contractAddress,
            chainId: raw.caip2ChainId,
            operator: raw.operator as Address,
            isSponsored: false, // Operator submissions are never "sponsored"
            registeredAt: BigInt(raw.reportedAt),
            // Note: batchId is not a tx hash; contracts don't have individual tx hashes
            batchId: raw.batchId,
          });
        }
      }

      // Process transactions
      if (transactionsRes) {
        for (const raw of transactionsRes.transactionBatchs.items) {
          let txChainId = raw.reportedChainCAIP2;
          if (!txChainId) {
            logger.contract.debug('Fallback to eip155:1 for transaction', {
              id: raw.id,
              merkleRoot: raw.merkleRoot,
            });
            txChainId = 'eip155:1';
          }
          entries.push({
            id: raw.id,
            type: 'transaction',
            identifier: raw.merkleRoot,
            chainId: txChainId,
            operator: raw.verifyingOperator as Address | undefined,
            reporter: raw.reporter as Address,
            isSponsored: raw.isSponsored,
            registeredAt: BigInt(raw.registeredAt),
            transactionHash: raw.transactionHash as Hash,
          });
        }
      }

      // Sort by registration time descending
      entries.sort((a, b) => {
        if (b.registeredAt > a.registeredAt) return 1;
        if (b.registeredAt < a.registeredAt) return -1;
        return 0;
      });

      // Limit total results
      const limited = entries.slice(0, limit);

      logger.contract.info('Recent registrations fetched', {
        total: limited.length,
        wallets: walletsRes?.stolenWallets.items.length ?? 0,
        contracts: contractsRes?.fraudulentContracts.items.length ?? 0,
        transactions: transactionsRes?.transactionBatchs.items.length ?? 0,
      });

      return limited;
    },
    staleTime: 30_000, // 30 seconds
    retry: 2,
  });

  return {
    registrations: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
