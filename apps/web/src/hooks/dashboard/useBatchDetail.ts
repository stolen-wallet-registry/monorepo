/**
 * Hook to fetch batch detail and entries for a specific batch ID.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import {
  WALLET_BATCH_ONLY_QUERY,
  WALLET_ENTRIES_BY_TX_HASH_QUERY,
  TRANSACTION_BATCH_ONLY_QUERY,
  TRANSACTION_ENTRIES_BY_TX_HASH_QUERY,
  CONTRACT_BATCH_DETAIL_QUERY,
  type RawWalletBatchOnlyResponse,
  type RawWalletEntriesByTxHashResponse,
  type RawTransactionBatchOnlyResponse,
  type RawTransactionEntriesByTxHashResponse,
  type RawContractBatchDetailResponse,
} from '@swr/search';
import { logger } from '@/lib/logger';
import { INDEXER_URL } from '@/lib/indexer';
import type { Address, Hash } from '@/lib/types/ethereum';
import type { BatchType } from './useBatches';
import { isAddress } from 'viem';

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function asOptionalAddress(value?: string | null): Address | undefined {
  if (!value) return undefined;
  return isAddress(value) ? (value as Address) : undefined;
}

export interface WalletBatchDetail {
  id: string;
  operatorId: string;
  operator: Address;
  reportedChainId?: string;
  walletCount: number;
  registeredAt: bigint;
  transactionHash: Hash;
}

export interface WalletBatchEntry {
  id: string;
  caip10: string;
  registeredAt: bigint;
  transactionHash: Hash;
  operator?: Address;
  sourceChainCAIP2?: string;
}

export interface TransactionBatchDetail {
  id: string;
  dataHash: string;
  reporter: Address;
  reportedChainId?: string;
  transactionCount: number;
  isSponsored: boolean;
  isOperator: boolean;
  operatorId?: string;
  registeredAt: bigint;
  transactionHash: Hash;
}

export interface TransactionBatchEntry {
  id: string;
  txHash: string;
  caip2ChainId: string;
  numericChainId?: number;
  reporter: Address;
  reportedAt: bigint;
}

export interface ContractBatchDetail {
  id: string;
  operatorId: string;
  operator: Address;
  reportedChainId?: string;
  contractCount: number;
  registeredAt: bigint;
  transactionHash: Hash;
}

export interface ContractBatchEntry {
  contractAddress: string;
  caip2ChainId: string;
  numericChainId?: number;
  operator: Address;
  reportedAt: bigint;
}

export type BatchDetailResult =
  | {
      type: 'wallet';
      batch: WalletBatchDetail;
      entries: WalletBatchEntry[];
    }
  | {
      type: 'transaction';
      batch: TransactionBatchDetail;
      entries: TransactionBatchEntry[];
    }
  | {
      type: 'contract';
      batch: ContractBatchDetail;
      entries: ContractBatchEntry[];
    };

export interface UseBatchDetailOptions {
  batchId: string;
  type: BatchType;
  limit?: number;
  offset?: number;
}

export interface UseBatchDetailResult {
  data: BatchDetailResult | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useBatchDetail(options: UseBatchDetailOptions): UseBatchDetailResult {
  const { batchId, type, limit = 25, offset = 0 } = options;
  const staleTime = type === 'contract' ? 30_000 : 120_000;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'batch-detail', { batchId, type, limit, offset }],
    enabled: !!batchId,
    queryFn: async (): Promise<BatchDetailResult | null> => {
      logger.contract.debug('Fetching batch detail', { batchId, type, limit, offset });

      if (type === 'wallet') {
        // Step 1: Fetch batch by ID
        const batchRes = await request<RawWalletBatchOnlyResponse>(
          INDEXER_URL,
          WALLET_BATCH_ONLY_QUERY,
          { batchId }
        );

        if (!batchRes.walletBatch) return null;

        // Step 2: Fetch entries by batch's transactionHash (join key)
        const entriesRes = await request<RawWalletEntriesByTxHashResponse>(
          INDEXER_URL,
          WALLET_ENTRIES_BY_TX_HASH_QUERY,
          { txHash: batchRes.walletBatch.transactionHash, limit, offset }
        );

        // Derive chain from first entry if batch-level is missing
        const walletReportedChain =
          batchRes.walletBatch.reportedChainCAIP2 ??
          entriesRes.stolenWallets.items[0]?.reportedChainCAIP2;

        const batch: WalletBatchDetail = {
          id: batchRes.walletBatch.id,
          operatorId: batchRes.walletBatch.operatorId,
          operator: batchRes.walletBatch.operator as Address,
          reportedChainId: walletReportedChain,
          walletCount: batchRes.walletBatch.walletCount,
          registeredAt: safeBigInt(batchRes.walletBatch.registeredAt),
          transactionHash: batchRes.walletBatch.transactionHash as Hash,
        };

        const entries = entriesRes.stolenWallets.items.map<WalletBatchEntry>((raw) => ({
          id: raw.id,
          caip10: raw.caip10,
          registeredAt: safeBigInt(raw.registeredAt),
          transactionHash: raw.transactionHash as Hash,
          operator: asOptionalAddress(raw.operator),
          sourceChainCAIP2: raw.sourceChainCAIP2,
        }));

        return { type: 'wallet', batch, entries };
      }

      if (type === 'transaction') {
        // Step 1: Fetch batch by ID
        const batchRes = await request<RawTransactionBatchOnlyResponse>(
          INDEXER_URL,
          TRANSACTION_BATCH_ONLY_QUERY,
          { batchId }
        );

        if (!batchRes.transactionBatch) return null;

        // Step 2: Fetch entries by batch's transactionHash (join key)
        const entriesRes = await request<RawTransactionEntriesByTxHashResponse>(
          INDEXER_URL,
          TRANSACTION_ENTRIES_BY_TX_HASH_QUERY,
          { txHash: batchRes.transactionBatch.transactionHash, limit, offset }
        );

        // Derive chain from first entry if batch-level is missing
        const txReportedChain =
          batchRes.transactionBatch.reportedChainCAIP2 ??
          entriesRes.transactionInBatchs.items[0]?.caip2ChainId;

        const batch: TransactionBatchDetail = {
          id: batchRes.transactionBatch.id,
          dataHash: batchRes.transactionBatch.dataHash,
          reporter: batchRes.transactionBatch.reporter as Address,
          reportedChainId: txReportedChain,
          transactionCount: batchRes.transactionBatch.transactionCount,
          isSponsored: batchRes.transactionBatch.isSponsored,
          isOperator: batchRes.transactionBatch.isOperator,
          operatorId: batchRes.transactionBatch.operatorId,
          registeredAt: safeBigInt(batchRes.transactionBatch.registeredAt),
          transactionHash: batchRes.transactionBatch.transactionHash as Hash,
        };

        const entries = entriesRes.transactionInBatchs.items.map<TransactionBatchEntry>((raw) => ({
          id: raw.id,
          txHash: raw.txHash,
          caip2ChainId: raw.caip2ChainId,
          numericChainId: raw.numericChainId,
          reporter: raw.reporter as Address,
          reportedAt: safeBigInt(raw.reportedAt),
        }));

        return { type: 'transaction', batch, entries };
      }

      const response = await request<RawContractBatchDetailResponse>(
        INDEXER_URL,
        CONTRACT_BATCH_DETAIL_QUERY,
        { batchId, limit, offset }
      );

      if (!response.fraudulentContractBatch) return null;

      const batch: ContractBatchDetail = {
        id: response.fraudulentContractBatch.id,
        operatorId: response.fraudulentContractBatch.operatorId,
        operator: response.fraudulentContractBatch.operator as Address,
        reportedChainId: response.fraudulentContractBatch.reportedChainCAIP2,
        contractCount: response.fraudulentContractBatch.contractCount,
        registeredAt: safeBigInt(response.fraudulentContractBatch.registeredAt),
        transactionHash: response.fraudulentContractBatch.transactionHash as Hash,
      };

      const entries = response.fraudulentContracts.items.map<ContractBatchEntry>((raw) => ({
        contractAddress: raw.contractAddress,
        caip2ChainId: raw.caip2ChainId,
        numericChainId: raw.numericChainId,
        operator: raw.operator as Address,
        reportedAt: safeBigInt(raw.reportedAt),
      }));

      return { type: 'contract', batch, entries };
    },
    staleTime,
    retry: 2,
  });

  return {
    data: data ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
