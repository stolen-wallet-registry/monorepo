/**
 * Hook to get the registration fee from the registry contract.
 *
 * Chain-aware: Uses quoteRegistration() on both hub and spoke.
 * - Hub (FraudRegistryV2): quoteRegistration() - no arguments
 * - Spoke (SpokeRegistryV2): quoteRegistration(address owner) - requires owner for bridge fee calculation
 */

import { useReadContract, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import { getRegistryMetadata } from '@/lib/contracts/registryMetadata';
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
 * @param ownerAddress - Required for spoke chains (for bridge fee calculation), optional for hub
 */
export function useQuoteRegistration(
  ownerAddress?: Address | null | undefined
): UseQuoteRegistrationResult {
  const chainId = useChainId();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'wallet',
    'useQuoteRegistration'
  );

  const isSpoke = registryType === 'spoke';

  // Get the correct ABI for hub/spoke
  const { abi } = getRegistryMetadata('wallet', registryType);

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId, // Explicit chain ID ensures RPC call targets correct chain
    functionName: 'quoteRegistration',
    // Hub: no arguments; Spoke: requires owner address for bridge fee calculation
    args: isSpoke && ownerAddress ? [ownerAddress] : [],
    query: {
      // For spoke, we need the owner address to be set
      enabled: !!contractAddress && (isSpoke ? !!ownerAddress : true),
      staleTime: 30_000, // 30 seconds
    },
  });

  // Log quote result for debugging
  if (result.isError) {
    logger.contract.error('useQuoteRegistration: quoteRegistration call failed', {
      chainId,
      contractAddress,
      registryType,
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
