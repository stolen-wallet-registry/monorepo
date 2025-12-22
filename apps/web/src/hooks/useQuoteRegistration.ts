/**
 * Hook to get the registration fee from the registry contract.
 *
 * Chain-aware: Uses quoteRegistration() on both hub and spoke.
 * - Hub: returns registration fee only
 * - Spoke: returns bridge fee + registration fee
 */

import { useReadContract, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { stolenWalletRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import { getRegistryAddress, getRegistryType } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';

export interface UseQuoteRegistrationResult {
  /** Fee in wei */
  feeWei: bigint | undefined;
  /** Fee in ETH (formatted) */
  feeEth: string | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Get the total registration fee for the current chain.
 *
 * @param ownerAddress - The wallet being registered (needed for nonce in quote)
 */
export function useQuoteRegistration(
  ownerAddress: Address | undefined
): UseQuoteRegistrationResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
  } catch {
    contractAddress = undefined;
  }

  const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;

  const result = useReadContract({
    address: contractAddress,
    abi,
    functionName: 'quoteRegistration',
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!ownerAddress && !!contractAddress,
      staleTime: 30_000, // 30 seconds
    },
  });

  return {
    feeWei: result.data as bigint | undefined,
    feeEth: result.data ? formatEther(result.data as bigint) : undefined,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}
