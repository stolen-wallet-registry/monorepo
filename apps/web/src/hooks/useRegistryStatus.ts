/**
 * Hook to query registry status for a wallet address.
 *
 * Uses the shared queryRegistryStatus function from @swr/ui
 * with wagmi's client management and TanStack Query caching.
 */

import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useChainId } from 'wagmi';
import {
  queryRegistryStatus,
  type RegistrationData,
  type AcknowledgementData,
  type RegistryStatusResult,
} from '@swr/ui';
import { stolenWalletRegistryAbi } from '@/lib/contracts/abis';
import { getStolenWalletRegistryAddress } from '@/lib/contracts/addresses';
import { registryStaleTime, registryKeys } from '@/lib/contracts/queryKeys';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

// Re-export types for backward compatibility
export type { RegistrationData, AcknowledgementData, RegistryStatusResult };

/**
 * Combined registry status for a wallet (extended with loading/error states).
 */
export interface RegistryStatus extends RegistryStatusResult {
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object if query failed */
  error: Error | null;
  /** Function to refetch status */
  refetch: () => void;
}

/**
 * Options for useRegistryStatus hook.
 */
export interface UseRegistryStatusOptions {
  /** Address to query (undefined skips query) */
  address?: Address;
  /** Enable automatic refetch interval (ms) or false to disable */
  refetchInterval?: number | false;
  /** Override chain ID to query (defaults to connected chain) */
  chainId?: number;
}

/**
 * Queries registry status for a wallet address.
 *
 * Uses shared queryRegistryStatus for the actual contract calls,
 * wrapped with TanStack Query for caching and wagmi for the client.
 *
 * @example
 * ```tsx
 * const { isRegistered, isPending, isLoading } = useRegistryStatus({
 *   address: '0x...',
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (isRegistered) return <Alert variant="destructive">Wallet is stolen</Alert>;
 * if (isPending) return <Alert variant="warning">Registration pending</Alert>;
 * return <Alert variant="success">Wallet is clean</Alert>;
 * ```
 */
export function useRegistryStatus({
  address,
  refetchInterval = false,
  chainId: overrideChainId,
}: UseRegistryStatusOptions): RegistryStatus {
  const connectedChainId = useChainId();
  const chainId = overrideChainId ?? connectedChainId;
  const client = usePublicClient({ chainId });

  let contractAddress: Address | undefined;
  try {
    contractAddress = getStolenWalletRegistryAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  // Warn when configuration is missing for the requested chainId
  if (!client) {
    logger.contract.warn('useRegistryStatus: Public client unavailable for chainId', { chainId });
  }
  if (!contractAddress) {
    logger.contract.warn('useRegistryStatus: Contract address not configured for chainId', {
      chainId,
    });
  }

  // Debug logging
  logger.contract.debug('useRegistryStatus query config', {
    address,
    overrideChainId,
    connectedChainId,
    resolvedChainId: chainId,
    contractAddress,
    hasClient: !!client,
  });

  const enabled = !!address && !!contractAddress && !!client;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: queryRefetch,
  } = useQuery({
    // Include chainId in query key to prevent cache collisions across chains
    queryKey: address ? registryKeys.status(address, chainId) : ['registry', 'status', 'disabled'],
    queryFn: async () => {
      if (!client || !contractAddress || !address) {
        throw new Error('Missing required parameters');
      }
      return queryRegistryStatus(client, address, contractAddress, stolenWalletRegistryAbi);
    },
    enabled,
    staleTime: registryStaleTime.status,
    refetchInterval: refetchInterval || undefined,
  });

  // Log status for debugging
  if (enabled && !isLoading && !isError && data) {
    logger.contract.debug('Registry status result', {
      address,
      isRegistered: data.isRegistered,
      isPending: data.isPending,
      hasRegistrationData: !!data.registrationData,
      hasAcknowledgementData: !!data.acknowledgementData,
    });
  }

  // Wrap queryRefetch to match expected void return signature
  // Guard against calling when params are missing to prevent queryFn from throwing
  const refetch: () => void = () => {
    if (!enabled) return;
    void queryRefetch();
  };

  return {
    isRegistered: data?.isRegistered ?? false,
    isPending: data?.isPending ?? false,
    registrationData: data?.registrationData ?? null,
    acknowledgementData: data?.acknowledgementData ?? null,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}
