/**
 * Block explorer URL utilities.
 *
 * Generates explorer URLs for transactions and addresses.
 * Chain info is derived from wagmi config to avoid duplicate configuration.
 */

import { config } from './wagmi';
import type { Address, Hash } from '@/lib/types/ethereum';

/**
 * Find a chain by ID from wagmi config.
 */
function findChain(chainId: number) {
  return config.chains.find((c) => c.id === chainId);
}

/**
 * Get the block explorer URL for a transaction.
 *
 * @param chainId - The chain ID
 * @param txHash - The transaction hash
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerTxUrl(chainId: number, txHash: Hash): string | null {
  const chain = findChain(chainId);
  const baseUrl = chain?.blockExplorers?.default?.url?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the block explorer URL for an address.
 *
 * @param chainId - The chain ID
 * @param address - The address
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerAddressUrl(chainId: number, address: Address): string | null {
  const chain = findChain(chainId);
  const baseUrl = chain?.blockExplorers?.default?.url?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get the block explorer name for a chain.
 *
 * @param chainId - The chain ID
 * @returns The explorer name or "Explorer" as default
 */
export function getExplorerName(chainId: number): string {
  const chain = findChain(chainId);
  return chain?.blockExplorers?.default?.name ?? 'Explorer';
}

/**
 * Get the full chain name for a chain ID.
 *
 * @param chainId - The chain ID
 * @returns The chain name or "Chain {id}" as default
 */
export function getChainName(chainId: number): string {
  const chain = findChain(chainId);
  return chain?.name ?? `Chain ${chainId}`;
}

/**
 * Get the short chain name for a chain ID (for badges/compact display).
 *
 * @param chainId - The chain ID
 * @returns The short chain name or chain ID as string
 */
export function getChainShortName(chainId: number): string {
  const chain = findChain(chainId);
  if (!chain) return `#${chainId}`;

  // Special case: localhost/anvil chains show as "Local"
  const name = chain.name.toLowerCase();
  if (name.includes('localhost') || name.includes('anvil')) {
    return 'Local';
  }

  // Default: use chain name (wagmi names are typically short enough)
  return chain.name;
}
