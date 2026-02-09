/**
 * Hook to read the current nonce for an address from the registry contract.
 *
 * The nonce is used for replay protection in EIP-712 signatures.
 * Each signature must use the current nonce, which increments after each successful use.
 *
 * Chain-aware: Works with both hub and spoke chains.
 * Supports both wallet and transaction registries via variant parameter.
 */

import { useEffect, useCallback } from 'react';
import { useReadContract, useChainId, type UseReadContractReturnType } from 'wagmi';
import { resolveRegistryContract, type RegistryVariant } from '@/lib/contracts/resolveContract';
import { walletRegistryAbi, transactionRegistryAbi, spokeRegistryAbi } from '@/lib/contracts/abis';
import type { Address } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

/** Result of refetch operation with status information */
export interface RefetchResult<T> {
  status: 'success' | 'error';
  data: T | undefined;
  error: Error | null;
}

export interface UseContractNonceResult {
  nonce: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: UseReadContractReturnType['refetch'];
}

/** Extended result for transaction registry with typed refetch */
export interface UseContractNonceExtendedResult {
  nonce: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Refetch the nonce from the contract with typed result */
  refetch: () => Promise<RefetchResult<bigint>>;
}

/**
 * Reads the current nonce for an address from the contract.
 *
 * @param ownerAddress - The address to get the nonce for
 * @param variant - Registry variant: 'wallet' (default) or 'transaction'
 * @returns The current nonce value and loading/error states
 */
export function useContractNonce(
  ownerAddress: Address | undefined,
  variant: RegistryVariant = 'wallet'
): UseContractNonceResult {
  const chainId = useChainId();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    variant,
    'useContractNonce'
  );

  const isSpoke = registryType === 'spoke';
  const enabled = !!ownerAddress && !!contractAddress;

  // Transaction registry needs faster polling for merkle batch workflows
  const refetchInterval = variant === 'transaction' ? 5_000 : undefined;
  const staleTime = variant === 'transaction' ? undefined : 30_000;

  // Split-call: one hook per ABI, only one fires based on registryType
  // For hub, choose wallet or transaction ABI based on variant
  const hubAbi = variant === 'transaction' ? transactionRegistryAbi : walletRegistryAbi;

  const hubResult = useReadContract({
    address: contractAddress,
    abi: hubAbi,
    chainId,
    functionName: 'nonces',
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: !isSpoke && enabled,
      staleTime,
      refetchInterval,
    },
  });

  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    chainId,
    functionName: 'nonces',
    args: ownerAddress ? [ownerAddress] : undefined,
    query: {
      enabled: isSpoke && enabled,
      staleTime,
      refetchInterval,
    },
  });

  const result = isSpoke ? spokeResult : hubResult;

  // Log nonce changes for debugging (transaction registry only)
  useEffect(() => {
    if (variant === 'transaction' && result.data !== undefined) {
      logger.contract.debug('Registry nonce read', {
        variant,
        address: ownerAddress,
        nonce: (result.data as bigint).toString(),
      });
    }
  }, [variant, result.data, ownerAddress]);

  return {
    nonce: result.data as bigint | undefined,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Hook for transaction registry nonce with typed refetch result.
 * This is a convenience wrapper for transaction-specific usage.
 *
 * @param address - The address to get the nonce for (the reporter)
 * @returns The nonce and loading/error states with typed refetch
 */
export function useTxContractNonce(address: Address | undefined): UseContractNonceExtendedResult {
  const chainId = useChainId();

  // Resolve contract address with built-in error handling and logging
  const { address: contractAddress, role: registryType } = resolveRegistryContract(
    chainId,
    'transaction',
    'useTxContractNonce'
  );

  const isSpoke = registryType === 'spoke';
  const enabled = !!address && !!contractAddress;

  // Split-call: one hook per ABI, only one fires based on registryType
  const hubResult = useReadContract({
    address: contractAddress,
    abi: transactionRegistryAbi,
    functionName: 'nonces',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !isSpoke && enabled,
      refetchInterval: 5_000,
    },
  });

  const spokeResult = useReadContract({
    address: contractAddress,
    abi: spokeRegistryAbi,
    functionName: 'nonces',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: isSpoke && enabled,
      refetchInterval: 5_000,
    },
  });

  const { data: nonce, isLoading, isError, error, refetch } = isSpoke ? spokeResult : hubResult;

  // Log nonce changes in useEffect to avoid logging on every render
  useEffect(() => {
    if (nonce !== undefined) {
      logger.contract.debug('Transaction registry nonce read', {
        address,
        nonce: (nonce as bigint).toString(),
      });
    }
  }, [nonce, address]);

  // Type-safe wrapper for refetch that returns a properly typed result
  const wrappedRefetch = useCallback(async (): Promise<RefetchResult<bigint>> => {
    try {
      const result = await refetch();
      return {
        status: result.status === 'success' ? 'success' : 'error',
        data: result.data as bigint | undefined,
        error: result.error as Error | null,
      };
    } catch (err) {
      return {
        status: 'error',
        data: undefined,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }, [refetch]);

  return {
    nonce: nonce as bigint | undefined,
    isLoading,
    isError,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
