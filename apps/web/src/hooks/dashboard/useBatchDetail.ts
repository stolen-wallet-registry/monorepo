/**
 * Hook to fetch batch detail and entries for a specific batch ID.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import {
  WALLET_BATCH_DETAIL_QUERY,
  TRANSACTION_BATCH_DETAIL_QUERY,
  CONTRACT_BATCH_DETAIL_QUERY,
  INVALIDATIONS_BATCH_QUERY,
  type RawWalletBatchDetailResponse,
  type RawTransactionBatchDetailResponse,
  type RawContractBatchDetailResponse,
  type RawInvalidationsBatchResponse,
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
  merkleRoot: string;
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
  merkleRoot: string;
  reporter: Address;
  reportedChainId?: string;
  transactionCount: number;
  isSponsored: boolean;
  isOperatorVerified: boolean;
  verifyingOperator?: Address;
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
  merkleRoot: string;
  operator: Address;
  reportedChainId?: string;
  contractCount: number;
  registeredAt: bigint;
  transactionHash: Hash;
  invalidated: boolean;
  invalidatedAt?: bigint | null;
}

export interface ContractBatchEntry {
  contractAddress: string;
  caip2ChainId: string;
  numericChainId?: number;
  operator: Address;
  reportedAt: bigint;
  entryHash: string;
  invalidated: boolean;
  invalidatedAt?: bigint | null;
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
        const response = await request<RawWalletBatchDetailResponse>(
          INDEXER_URL,
          WALLET_BATCH_DETAIL_QUERY,
          { batchId, limit, offset }
        );

        if (!response.walletBatch) return null;

        const batch: WalletBatchDetail = {
          id: response.walletBatch.id,
          merkleRoot: response.walletBatch.merkleRoot,
          operator: response.walletBatch.operator as Address,
          reportedChainId: response.walletBatch.reportedChainCAIP2,
          walletCount: response.walletBatch.walletCount,
          registeredAt: safeBigInt(response.walletBatch.registeredAt),
          transactionHash: response.walletBatch.transactionHash as Hash,
        };

        const entries = response.stolenWallets.items.map<WalletBatchEntry>((raw) => ({
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
        const response = await request<RawTransactionBatchDetailResponse>(
          INDEXER_URL,
          TRANSACTION_BATCH_DETAIL_QUERY,
          { batchId, limit, offset }
        );

        if (!response.transactionBatch) return null;

        const batch: TransactionBatchDetail = {
          id: response.transactionBatch.id,
          merkleRoot: response.transactionBatch.merkleRoot,
          reporter: response.transactionBatch.reporter as Address,
          reportedChainId: response.transactionBatch.reportedChainCAIP2,
          transactionCount: response.transactionBatch.transactionCount,
          isSponsored: response.transactionBatch.isSponsored,
          isOperatorVerified: response.transactionBatch.isOperatorVerified,
          verifyingOperator: asOptionalAddress(response.transactionBatch.verifyingOperator),
          registeredAt: safeBigInt(response.transactionBatch.registeredAt),
          transactionHash: response.transactionBatch.transactionHash as Hash,
        };

        const entries = response.transactionInBatchs.items.map<TransactionBatchEntry>((raw) => ({
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
        merkleRoot: response.fraudulentContractBatch.merkleRoot,
        operator: response.fraudulentContractBatch.operator as Address,
        reportedChainId: response.fraudulentContractBatch.reportedChainCAIP2,
        contractCount: response.fraudulentContractBatch.contractCount,
        registeredAt: safeBigInt(response.fraudulentContractBatch.registeredAt),
        transactionHash: response.fraudulentContractBatch.transactionHash as Hash,
        invalidated: response.fraudulentContractBatch.invalidated,
        invalidatedAt: response.fraudulentContractBatch.invalidatedAt
          ? safeBigInt(response.fraudulentContractBatch.invalidatedAt)
          : null,
      };

      const entryHashes = response.fraudulentContracts.items.map((entry) => entry.entryHash);
      const invalidationMap = new Map<string, { invalidatedAt: bigint; reinstated: boolean }>();

      if (entryHashes.length > 0) {
        const invalidations = await request<RawInvalidationsBatchResponse>(
          INDEXER_URL,
          INVALIDATIONS_BATCH_QUERY,
          { entryHashes }
        );

        for (const item of invalidations.invalidatedEntrys.items) {
          invalidationMap.set(item.id, {
            invalidatedAt: safeBigInt(item.invalidatedAt),
            reinstated: item.reinstated,
          });
        }
      }

      const entries = response.fraudulentContracts.items.map<ContractBatchEntry>((raw) => {
        const invalidation = invalidationMap.get(raw.entryHash);
        const invalidated = invalidation ? !invalidation.reinstated : false;
        return {
          contractAddress: raw.contractAddress,
          caip2ChainId: raw.caip2ChainId,
          numericChainId: raw.numericChainId,
          operator: raw.operator as Address,
          reportedAt: safeBigInt(raw.reportedAt),
          entryHash: raw.entryHash,
          invalidated,
          invalidatedAt: invalidation ? invalidation.invalidatedAt : null,
        };
      });

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
