/**
 * Hook to read the current nonce for an address from the StolenWalletRegistry contract.
 *
 * The nonce is used for replay protection in EIP-712 signatures.
 * Each signature must use the current nonce, which increments after each successful use.
 */

import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getContractAddress } from '@/lib/contracts/addresses';

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
export function useContractNonce(ownerAddress: `0x${string}` | undefined): UseContractNonceResult {
  const chainId = useChainId();

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  const result = useReadContract({
    address: contractAddress,
    abi: stolenWalletRegistryAbi,
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
