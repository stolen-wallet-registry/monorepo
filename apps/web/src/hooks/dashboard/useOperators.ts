/**
 * Hook to fetch list of approved operators from the Ponder indexer.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import { OPERATORS_LIST_QUERY, type RawOperatorsListResponse } from '@swr/search';
import { logger } from '@/lib/logger';
import { INDEXER_URL } from '@/lib/indexer';
import type { Address } from '@/lib/types/ethereum';

/** Capability bitmask values */
export const CAPABILITY_WALLET = 0x01;
export const CAPABILITY_TX = 0x02;
export const CAPABILITY_CONTRACT = 0x04;

export interface OperatorInfo {
  /** Operator address */
  address: Address;
  /** Human-readable identifier */
  identifier: string;
  /** Raw capabilities bitmask */
  capabilities: number;
  /** Is currently approved */
  approved: boolean;
  /** Can submit to wallet registry */
  canSubmitWallet: boolean;
  /** Can submit to transaction registry */
  canSubmitTransaction: boolean;
  /** Can submit to contract registry */
  canSubmitContract: boolean;
  /** Block number when approved */
  approvedAt: bigint;
}

export interface UseOperatorsOptions {
  /** Filter by approval status (default: true for approved only) */
  approvedOnly?: boolean;
}

export interface UseOperatorsResult {
  /** List of operators */
  operators: OperatorInfo[];
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
 * Fetch list of operators.
 *
 * @example
 * ```tsx
 * const { operators, isLoading } = useOperators();
 *
 * operators.forEach(op => {
 *   console.log(`${op.identifier}: ${op.address}`);
 * });
 * ```
 */
export function useOperators(options: UseOperatorsOptions = {}): UseOperatorsResult {
  const { approvedOnly = true } = options;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'operators', { approvedOnly }],
    queryFn: async (): Promise<OperatorInfo[]> => {
      logger.contract.debug('Fetching operators from indexer', { approvedOnly });

      const response = await request<RawOperatorsListResponse>(INDEXER_URL, OPERATORS_LIST_QUERY, {
        approved: approvedOnly ? true : undefined,
      });

      const operators: OperatorInfo[] = response.operators.items.map((raw) => ({
        address: raw.id as Address,
        identifier: raw.identifier,
        capabilities: raw.capabilities,
        approved: raw.approved,
        canSubmitWallet: raw.canSubmitWallet,
        canSubmitTransaction: raw.canSubmitTransaction,
        canSubmitContract: raw.canSubmitContract,
        approvedAt: BigInt(raw.approvedAt),
      }));

      logger.contract.info('Operators fetched', { count: operators.length });

      return operators;
    },
    staleTime: 60_000, // 1 minute (operators don't change often)
    retry: 2,
  });

  return {
    operators: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Check if a capabilities bitmask includes wallet registry access.
 */
export function canSubmitWallet(capabilities: number): boolean {
  return (capabilities & CAPABILITY_WALLET) !== 0;
}

/**
 * Check if a capabilities bitmask includes transaction registry access.
 */
export function canSubmitTransaction(capabilities: number): boolean {
  return (capabilities & CAPABILITY_TX) !== 0;
}

/**
 * Check if a capabilities bitmask includes contract registry access.
 */
export function canSubmitContract(capabilities: number): boolean {
  return (capabilities & CAPABILITY_CONTRACT) !== 0;
}
