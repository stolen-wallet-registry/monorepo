/**
 * Hook to resolve registry contract address and type.
 *
 * Consolidates the address resolution pattern used across all registry hooks.
 * Handles both wallet and transaction registries, with hub/spoke chain awareness.
 */

import { useMemo } from 'react';
import { useChainId } from 'wagmi';
import { logger } from '@/lib/logger';
import {
  getRegistryAddress,
  getRegistryType,
  getTransactionRegistryAddress,
  type RegistryType,
} from '@/lib/contracts/addresses';
import type { RegistryVariant } from '@/lib/contracts/registryMetadata';
import type { Address } from '@/lib/types/ethereum';

export type { RegistryVariant };

export interface ResolvedRegistry {
  /** The resolved contract address (undefined if resolution failed) */
  contractAddress: Address | undefined;
  /** Whether this is a hub or spoke chain */
  registryType: RegistryType;
  /** Whether resolution was successful */
  isResolved: boolean;
  /** The current chain ID */
  chainId: number;
}

/**
 * Resolve registry contract address for the current chain.
 *
 * @param variant - 'wallet' for StolenWalletRegistry, 'transaction' for StolenTransactionRegistry
 * @returns Resolved registry information including address and chain type
 *
 * @example
 * ```ts
 * // For wallet registration hooks
 * const { contractAddress, registryType, isResolved } = useResolveRegistryContract('wallet');
 *
 * // For transaction registration hooks
 * const { contractAddress, registryType } = useResolveRegistryContract('transaction');
 * ```
 */
export function useResolveRegistryContract(variant: RegistryVariant = 'wallet'): ResolvedRegistry {
  const chainId = useChainId();

  return useMemo(() => {
    try {
      const contractAddress =
        variant === 'wallet' ? getRegistryAddress(chainId) : getTransactionRegistryAddress(chainId);
      const registryType = getRegistryType(chainId);

      logger.contract.debug('Registry resolved', {
        chainId,
        variant,
        contractAddress,
        registryType,
      });

      return { contractAddress, registryType, isResolved: true, chainId };
    } catch (error) {
      logger.contract.error('Failed to resolve registry', {
        chainId,
        variant,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        contractAddress: undefined,
        registryType: 'hub' as RegistryType,
        isResolved: false,
        chainId,
      };
    }
  }, [chainId, variant]);
}

// Re-export types for convenience
export type { RegistryType } from '@/lib/contracts/addresses';
