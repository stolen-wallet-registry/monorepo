/**
 * Hook to get the registration fee from the registry contract.
 *
 * Unified interface: Both hub and spoke expose quoteRegistration(address).
 * - Hub (WalletRegistry): quoteRegistration(address) - reads from FeeManager, ignores address
 * - Spoke (SpokeRegistry): quoteRegistration(address owner) - includes bridge fee
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
 * @param ownerAddress - The wallet being registered (used by spoke for bridge quote accuracy, ignored on hub)
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

  // Get the correct ABI and function name (unified: quoteRegistration on both hub and spoke)
  const { abi, functions } = getRegistryMetadata('wallet', registryType);

  const result = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    // wagmi boundary: dynamic ABI + function name from registryMetadata breaks
    // wagmi's literal-type inference. See registryMetadata.ts for the mapping.
    functionName: functions.quoteRegistration as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !!contractAddress && !!ownerAddress,
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
