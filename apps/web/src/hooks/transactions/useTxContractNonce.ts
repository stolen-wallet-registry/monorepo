/**
 * Hook to read the nonce from the transaction registry contract.
 * Supports both hub (StolenTransactionRegistry) and spoke (SpokeTransactionRegistry) chains.
 */

import { useEffect, useCallback } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import { stolenTransactionRegistryAbi, spokeTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress, isSpokeChain } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

/** Result of refetch operation with status information */
export interface RefetchResult<T> {
  status: 'success' | 'error';
  data: T | undefined;
  error: Error | null;
}

export interface UseTxContractNonceResult {
  nonce: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Refetch the nonce from the contract with typed result */
  refetch: () => Promise<RefetchResult<bigint>>;
}

/**
 * Hook to read the current nonce for an address from the transaction registry.
 * Automatically selects the correct contract based on chain (hub or spoke).
 *
 * @param address - The address to get the nonce for (the reporter)
 * @returns The nonce and loading/error states
 */
export function useTxContractNonce(address: Address | undefined): UseTxContractNonceResult {
  const chainId = useChainId();
  const isSpoke = isSpokeChain(chainId);

  let contractAddress: Address | undefined;
  try {
    contractAddress = getTransactionRegistryAddress(chainId);
    logger.contract.debug('Transaction registry address resolved for nonce', {
      chainId,
      contractAddress,
      isSpoke,
    });
  } catch (err) {
    contractAddress = undefined;
    logger.contract.error('Failed to resolve transaction registry address for nonce', {
      chainId,
      isSpoke,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Use the correct ABI for hub vs spoke
  const abi = isSpoke ? spokeTransactionRegistryAbi : stolenTransactionRegistryAbi;

  const enabled = !!address && !!contractAddress;

  const {
    data: nonce,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContract({
    address: contractAddress,
    abi,
    functionName: 'nonces',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled,
      refetchInterval: 5000, // Auto-refetch every 5 seconds
    },
  });

  // Log nonce changes in useEffect to avoid logging on every render
  useEffect(() => {
    if (nonce !== undefined) {
      logger.contract.debug('Transaction registry nonce read', {
        address,
        nonce: nonce.toString(),
      });
    }
  }, [nonce, address]);

  // Type-safe wrapper for refetch that returns a properly typed result
  const wrappedRefetch = useCallback(async (): Promise<RefetchResult<bigint>> => {
    try {
      const result = await refetch();
      return {
        status: result.status === 'success' ? 'success' : 'error',
        data: result.data as bigint | undefined,
        error: result.error as Error | null,
      };
    } catch (err) {
      return {
        status: 'error',
        data: undefined,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }, [refetch]);

  return {
    nonce: nonce as bigint | undefined,
    isLoading,
    isError,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
