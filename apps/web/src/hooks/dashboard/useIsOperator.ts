/**
 * Hook to check if connected wallet is an approved operator.
 *
 * Queries the OperatorRegistry.isApproved(address) function.
 */

import { useReadContract, useAccount, useChainId } from 'wagmi';
import { operatorRegistryAbi } from '@/lib/contracts/abis';
import { getOperatorRegistryAddress } from '@/lib/contracts/addresses';
import type { Address } from '@/lib/types/ethereum';

export interface UseIsOperatorOptions {
  /** Override address to check (defaults to connected wallet) */
  address?: Address;
  /** Override chain ID */
  chainId?: number;
}

export interface UseIsOperatorResult {
  /** Whether the address is an approved operator */
  isOperator: boolean;
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
 * Check if an address is an approved operator.
 *
 * @example
 * ```tsx
 * const { isOperator, isLoading } = useIsOperator();
 *
 * if (isOperator) {
 *   // Show operator-specific UI
 * }
 * ```
 */
export function useIsOperator(options: UseIsOperatorOptions = {}): UseIsOperatorResult {
  const { address: connectedAddress } = useAccount();
  const currentChainId = useChainId();

  const address = options.address ?? connectedAddress;
  const chainId = options.chainId ?? currentChainId;

  let contractAddress: Address | undefined;
  try {
    contractAddress = getOperatorRegistryAddress(chainId);
  } catch {
    // Contract not deployed on this chain
    contractAddress = undefined;
  }

  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: contractAddress,
    abi: operatorRegistryAbi,
    functionName: 'isApproved',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!contractAddress,
      staleTime: 30_000, // 30 seconds
    },
  });

  return {
    isOperator: data === true,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
