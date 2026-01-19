/**
 * Hook to read the nonce from the StolenTransactionRegistry contract.
 */

import { useReadContract, useChainId } from 'wagmi';
import { stolenTransactionRegistryAbi } from '@/lib/contracts/abis';
import { getStolenTransactionRegistryAddress } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface UseTxContractNonceResult {
  nonce: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to read the current nonce for an address from the transaction registry.
 *
 * @param address - The address to get the nonce for (the reporter)
 * @returns The nonce and loading/error states
 */
export function useTxContractNonce(address: Address | undefined): UseTxContractNonceResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  try {
    contractAddress = getStolenTransactionRegistryAddress(chainId);
    logger.contract.debug('Transaction registry address resolved for nonce', {
      chainId,
      contractAddress,
    });
  } catch (err) {
    contractAddress = undefined;
    logger.contract.error('Failed to resolve transaction registry address for nonce', {
      chainId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const enabled = !!address && !!contractAddress;

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: contractAddress,
    abi: stolenTransactionRegistryAbi,
    functionName: 'nonces',
    args: enabled ? [address!] : undefined,
    query: {
      enabled,
      staleTime: 5_000, // 5 seconds
    },
  });

  if (isError) {
    logger.contract.error('Failed to read nonce from transaction registry', {
      chainId,
      contractAddress,
      address,
      error: error?.message,
    });
  } else if (data !== undefined) {
    logger.contract.debug('Transaction registry nonce read', {
      address,
      nonce: data.toString(),
    });
  }

  return {
    nonce: data,
    isLoading,
    isError,
    error,
    refetch,
  };
}
