/**
 * Hook to check if connected wallet is the DAO (contract owner).
 *
 * Queries the OperatorRegistry.owner() function.
 */

import { useReadContract, useAccount, useChainId } from 'wagmi';
import { operatorRegistryAbi } from '@/lib/contracts/abis';
import { getOperatorRegistryAddress } from '@swr/chains';
import type { Address } from '@/lib/types/ethereum';

export interface UseIsDAOOptions {
  /** Override address to check (defaults to connected wallet) */
  address?: Address;
  /** Override chain ID */
  chainId?: number;
}

export interface UseIsDAOResult {
  /** Whether the address is the DAO (contract owner) */
  isDAO: boolean;
  /** The current owner address */
  ownerAddress: Address | undefined;
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
 * Check if an address is the DAO (contract owner).
 *
 * @example
 * ```tsx
 * const { isDAO, isLoading } = useIsDAO();
 *
 * if (isDAO) {
 *   // Show DAO management UI
 * }
 * ```
 */
export function useIsDAO(options: UseIsDAOOptions = {}): UseIsDAOResult {
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
    functionName: 'owner',
    query: {
      enabled: !!contractAddress,
      staleTime: 60_000, // 1 minute (owner rarely changes)
    },
  });

  const ownerAddress = data as Address | undefined;
  const isDAO = !!address && !!ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase();

  return {
    isDAO,
    ownerAddress,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
