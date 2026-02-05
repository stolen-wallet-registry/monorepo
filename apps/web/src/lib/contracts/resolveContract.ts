/**
 * Utility for resolving registry contract addresses with error handling.
 *
 * Consolidates the try-catch address resolution pattern used across 20+ hooks.
 * Supports both wallet and transaction registries with hub/spoke chain awareness.
 *
 * @example
 * ```ts
 * // Before (15 lines repeated in every hook)
 * let contractAddress: Address | undefined;
 * let registryType: 'hub' | 'spoke' = 'hub';
 * try {
 *   contractAddress = getRegistryAddress(chainId);
 *   registryType = getRegistryType(chainId);
 *   logger.contract.debug('Registry resolved', { ... });
 * } catch (error) {
 *   contractAddress = undefined;
 *   logger.contract.error('Failed to resolve', { ... });
 * }
 *
 * // After (1 line)
 * const { address, role, isResolved } = resolveRegistryContract(chainId, 'wallet');
 * ```
 */

import { logger } from '@/lib/logger';
import {
  getRegistryAddress,
  getRegistryType,
  type RegistryType,
  type RegistryVariant,
} from './addresses';
import type { Address } from '@/lib/types/ethereum';

export type { RegistryVariant } from './addresses';

export interface ResolvedContract {
  /** The resolved contract address (undefined if resolution failed) */
  address: Address | undefined;
  /** Whether this is a hub or spoke chain */
  role: RegistryType;
  /** Whether resolution was successful */
  isResolved: boolean;
}

/**
 * Resolve registry contract address for a given chain.
 *
 * This function handles the common pattern of:
 * 1. Getting the contract address for wallet/transaction registry
 * 2. Determining if it's a hub or spoke chain
 * 3. Logging success/failure
 * 4. Returning undefined on error instead of throwing
 *
 * @param chainId - The chain ID to resolve for
 * @param variant - 'wallet' for StolenWalletRegistry, 'transaction' for StolenTransactionRegistry
 * @param context - Optional context string for logging (e.g., 'useContractDeadlines')
 * @returns Resolved contract info with address, role, and success flag
 */
export function resolveRegistryContract(
  chainId: number,
  variant: RegistryVariant = 'wallet',
  context?: string
): ResolvedContract {
  const logContext = context ? `${context}: ` : '';

  try {
    const address = getRegistryAddress(chainId, variant);
    const role = getRegistryType(chainId);

    logger.contract.debug(`${logContext}Registry resolved`, {
      chainId,
      variant,
      address,
      role,
    });

    return { address, role, isResolved: true };
  } catch (error) {
    logger.contract.error(`${logContext}Failed to resolve registry`, {
      chainId,
      variant,
      error: error instanceof Error ? error.message : String(error),
    });

    return { address: undefined, role: 'hub', isResolved: false };
  }
}
