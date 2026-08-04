/**
 * Hook to fetch recent batch registrations across all registry types.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import {
  RECENT_WALLET_BATCHES_QUERY,
  RECENT_TRANSACTIONS_QUERY,
  RECENT_CONTRACT_BATCHES_QUERY,
  type RawRecentWalletBatchesResponse,
  type RawRecentTransactionsResponse,
  type RawRecentContractBatchesResponse,
} from '@swr/search';
import { logger } from '@/lib/logger';
import {
  INDEXER_URL,
  parseIndexerAddress,
  parseIndexerHash,
  logDroppedIndexerRow,
} from '@/lib/indexer';
import type { Address, Hash } from '@/lib/types/ethereum';

export type BatchType = 'wallet' | 'transaction' | 'contract';

const BATCH_PREFIX: Record<BatchType, string> = {
  wallet: 'W',
  transaction: 'TX',
  contract: 'C',
};

/** Format a batch ID with a registry-type prefix for display (e.g. "W-1", "TX-2", "C-3"). */
export function formatBatchId(type: BatchType, rawId: string): string {
  return `${BATCH_PREFIX[type]}-${rawId}`;
}

export interface BatchSummary {
  /** Batch ID (uint256 as string) */
  id: string;
  /** Batch registry type */
  type: BatchType;
  /** Operator or reporter address */
  submitter: Address;
  /** Reported chain (CAIP-2) */
  reportedChainId?: string;
  /** Number of items in the batch */
  count: number;
  /** Registration timestamp (Unix seconds) */
  registeredAt: bigint;
  /** Registration transaction hash */
  transactionHash: Hash;
  /** Transaction batches: whether from operator (TransactionBatchCreated) */
  isOperator?: boolean;
  /** Operator ID (bytes32, for operator batches) */
  operatorId?: string;
  /** Transaction batches: dataHash */
  dataHash?: string;
}

export interface UseBatchesOptions {
  /** Filter by batch type (default: all) */
  type?: BatchType | 'all';
  /** Number of batches to fetch per type (default: 50) */
  limit?: number;
}

export interface UseBatchesResult {
  batches: BatchSummary[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch recent batches across all registry types.
 */
export function useBatches(options: UseBatchesOptions = {}): UseBatchesResult {
  const { type = 'all', limit = 50 } = options;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'batches', { type, limit }],
    queryFn: async (): Promise<BatchSummary[]> => {
      logger.contract.debug('Fetching recent batches', { type, limit });

      const batches: BatchSummary[] = [];

      const fetchWallets = type === 'all' || type === 'wallet';
      const fetchTransactions = type === 'all' || type === 'transaction';
      const fetchContracts = type === 'all' || type === 'contract';

      const [walletsRes, transactionsRes, contractsRes] = await Promise.all([
        fetchWallets
          ? request<RawRecentWalletBatchesResponse>(INDEXER_URL, RECENT_WALLET_BATCHES_QUERY, {
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
        fetchContracts
          ? request<RawRecentContractBatchesResponse>(INDEXER_URL, RECENT_CONTRACT_BATCHES_QUERY, {
              limit,
              offset: 0,
            })
          : null,
      ]);

      if (walletsRes) {
        for (const raw of walletsRes.walletBatchs.items) {
          const submitter = parseIndexerAddress(raw.operator);
          const transactionHash = parseIndexerHash(raw.transactionHash);
          if (!submitter || !transactionHash) {
            logDroppedIndexerRow('walletBatch', raw.id);
            continue;
          }

          batches.push({
            id: raw.id,
            type: 'wallet',
            submitter,
            reportedChainId: raw.reportedChainCAIP2,
            count: raw.walletCount,
            registeredAt: BigInt(raw.registeredAt),
            transactionHash,
            operatorId: raw.operatorId,
          });
        }
      }

      if (transactionsRes) {
        for (const raw of transactionsRes.transactionBatchs.items) {
          const submitter = parseIndexerAddress(raw.reporter);
          const transactionHash = parseIndexerHash(raw.transactionHash);
          if (!submitter || !transactionHash) {
            logDroppedIndexerRow('transactionBatch', raw.id);
            continue;
          }

          batches.push({
            id: raw.id,
            type: 'transaction',
            submitter,
            reportedChainId: raw.reportedChainCAIP2,
            count: raw.transactionCount,
            registeredAt: BigInt(raw.registeredAt),
            transactionHash,
            isOperator: raw.isOperator,
            operatorId: raw.operatorId,
            dataHash: raw.dataHash,
          });
        }
      }

      if (contractsRes) {
        for (const raw of contractsRes.fraudulentContractBatchs.items) {
          const submitter = parseIndexerAddress(raw.operator);
          const transactionHash = parseIndexerHash(raw.transactionHash);
          if (!submitter || !transactionHash) {
            logDroppedIndexerRow('contractBatch', raw.id);
            continue;
          }

          batches.push({
            id: raw.id,
            type: 'contract',
            submitter,
            reportedChainId: raw.reportedChainCAIP2,
            count: raw.contractCount,
            registeredAt: BigInt(raw.registeredAt),
            transactionHash,
            operatorId: raw.operatorId,
          });
        }
      }

      batches.sort((a, b) => {
        if (b.registeredAt > a.registeredAt) return 1;
        if (b.registeredAt < a.registeredAt) return -1;
        return 0;
      });

      logger.contract.info('Batches fetched', {
        total: batches.length,
        wallets: walletsRes?.walletBatchs.items.length ?? 0,
        transactions: transactionsRes?.transactionBatchs.items.length ?? 0,
        contracts: contractsRes?.fraudulentContractBatchs.items.length ?? 0,
      });

      return batches;
    },
    staleTime: 30_000,
    retry: 2,
  });

  return {
    batches: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
