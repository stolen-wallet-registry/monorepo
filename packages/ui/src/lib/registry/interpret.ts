/**
 * Result interpretation utilities for registry status.
 */

import type { RegistryStatusResult, ResultStatus } from './types';

/**
 * Get simplified status from registry result.
 *
 * @param result - Registry status from queryRegistryStatus
 * @returns 'registered' | 'pending' | 'not-found'
 *
 * @example
 * ```ts
 * const result = await queryRegistryStatus(client, address, contract, abi);
 * const status = getResultStatus(result);
 * // status: 'registered' | 'pending' | 'not-found'
 * ```
 */
export function getResultStatus(result: RegistryStatusResult): ResultStatus {
  if (result.isRegistered) return 'registered';
  if (result.isPending) return 'pending';
  return 'not-found';
}

/**
 * Get human-readable label for status.
 */
export function getStatusLabel(status: ResultStatus): string {
  switch (status) {
    case 'registered':
      return 'Stolen';
    case 'pending':
      return 'Pending';
    case 'not-found':
      return 'Clean';
  }
}

/**
 * Get description for status.
 */
export function getStatusDescription(status: ResultStatus): string {
  switch (status) {
    case 'registered':
      return 'This wallet is registered as stolen in the registry.';
    case 'pending':
      return 'This wallet has a pending registration (in grace period).';
    case 'not-found':
      return 'This wallet is not in the registry.';
  }
}

/**
 * Format block number to approximate date/time.
 * Assumes ~12 second block time (Ethereum mainnet).
 *
 * @param blockNumber - Block number to format
 * @param currentBlock - Current block number (optional, for relative time)
 */
export function formatBlockAsTime(blockNumber: bigint, currentBlock?: bigint): string {
  if (currentBlock !== undefined) {
    const blocksDiff = currentBlock - blockNumber;
    const secondsDiff = Number(blocksDiff) * 12; // ~12 sec per block

    if (secondsDiff < 60) return `${secondsDiff}s ago`;
    if (secondsDiff < 3600) return `${Math.floor(secondsDiff / 60)}m ago`;
    if (secondsDiff < 86400) return `${Math.floor(secondsDiff / 3600)}h ago`;
    return `${Math.floor(secondsDiff / 86400)}d ago`;
  }

  return `Block #${blockNumber.toLocaleString()}`;
}

/**
 * Check if a wallet status indicates it's compromised.
 */
export function isWalletCompromised(result: RegistryStatusResult): boolean {
  return result.isRegistered || result.isPending;
}
