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
import { logger } from '@/lib/logger';

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
  ownerAddress: Address | null | undefined
): UseQuoteRegistrationResult {
  const chainId = useChainId();

  let contractAddress: Address | undefined;
  let registryType: 'hub' | 'spoke' = 'hub';
  try {
    contractAddress = getRegistryAddress(chainId);
    registryType = getRegistryType(chainId);
    logger.contract.debug('useQuoteRegistration: Registry address resolved', {
      chainId,
      contractAddress,
      registryType,
      ownerAddress,
    });
  } catch (error) {
    contractAddress = undefined;
    logger.contract.error('useQuoteRegistration: Failed to resolve registry address', {
      chainId,
      ownerAddress,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const abi = registryType === 'spoke' ? spokeRegistryAbi : stolenWalletRegistryAbi;

  // Convert null to undefined for wagmi compatibility
  const normalizedAddress = ownerAddress ?? undefined;

  const result = useReadContract({
    address: contractAddress,
    abi,
    functionName: 'quoteRegistration',
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: {
      enabled: !!normalizedAddress && !!contractAddress,
      staleTime: 30_000, // 30 seconds
    },
  });

  // Log quote result for debugging
  if (result.isError) {
    logger.contract.error('useQuoteRegistration: quoteRegistration call failed', {
      chainId,
      contractAddress,
      registryType,
      ownerAddress,
      error: result.error?.message,
    });
  } else if (result.data !== undefined) {
    logger.contract.debug('useQuoteRegistration: Quote received', {
      chainId,
      registryType,
      feeWei: (result.data as bigint).toString(),
      feeEth: formatEther(result.data as bigint),
    });
  }

  // Runtime validation - contract may return unexpected types
  const feeWei = typeof result.data === 'bigint' ? result.data : undefined;

  return {
    feeWei,
    feeEth: feeWei !== undefined ? formatEther(feeWei) : undefined,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}
