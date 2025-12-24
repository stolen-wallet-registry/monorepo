/**
 * Hook to read the current nonce for an address from the registry contract.
 *
 * The nonce is used for replay protection in EIP-712 signatures.
 * Each signature must use the current nonce, which increments after each successful use.
 *
 * Chain-aware: Works with both StolenWalletRegistry (hub) and SpokeRegistry (spoke).
 */

import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface UseContractNonceResult {
  nonce: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: UseReadContractReturnType['refetch'];
}

/**
 * Reads the current nonce for an owner address from the contract.
 *
 * @param ownerAddress - The address to get the nonce for
 * @returns The current nonce value
 */
export function useContractNonce(ownerAddress: Address | undefined): UseContractNonceResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
    logger.contract.debug('Registry address resolved for nonce', {
      chainId,
      contractAddress,
      registryType,
      ownerAddress,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('Failed to resolve registry address for nonce', {
      chainId,
      ownerAddress,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Both contracts have identical nonces() function
  const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;

  const result = useReadContract({
    address: contractAddress,
    abi,
    functionName: 'nonces',
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!ownerAddress && !!contractAddress,
      // Nonce doesn't change frequently, longer stale time is fine
      staleTime: 30_000, // 30 seconds
    },
  });

  return {
    nonce: result.data,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}
