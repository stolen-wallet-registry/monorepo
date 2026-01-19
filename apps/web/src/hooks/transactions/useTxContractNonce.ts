/**
 * Hook to read the nonce from the transaction registry contract.
 * Supports both hub (StolenTransactionRegistry) and spoke (SpokeTransactionRegistry) chains.
 */

import { useEffect } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import type { QueryObserverResult } from '@tanstack/react-query';
import { stolenTransactionRegistryAbi, spokeTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getTransactionRegistryAddress, isSpokeChain } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface UseTxContractNonceResult {
  nonce: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<QueryObserverResult<bigint, Error>>;
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

  return {
    nonce: nonce as bigint | undefined,
    isLoading,
    isError,
    error: error as Error | null,
    // Cast refetch to match our interface - wagmi's type is more complex
    refetch: refetch as unknown as () => Promise<QueryObserverResult<bigint, Error>>,
  };
}
