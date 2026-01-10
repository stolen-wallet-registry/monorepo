/**
 * Network configuration aggregator.
 *
 * All supported networks with lookup by chain ID.
 */

import type { NetworkConfig } from '../types';

// Individual network exports
export { anvilHub } from './anvil-hub';
export { anvilSpoke } from './anvil-spoke';
export { base } from './base';
export { baseSepolia } from './base-sepolia';
export { optimism } from './optimism';
export { optimismSepolia } from './optimism-sepolia';

// Import for map building
import { anvilHub } from './anvil-hub';
import { anvilSpoke } from './anvil-spoke';
import { base } from './base';
import { baseSepolia } from './base-sepolia';
import { optimism } from './optimism';
import { optimismSepolia } from './optimism-sepolia';

/**
 * All supported networks.
 */
export const allNetworks: readonly NetworkConfig[] = [
  anvilHub,
  anvilSpoke,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
] as const;

/**
 * Network lookup by chain ID.
 *
 * @example
 * const config = networks[84532]; // Base Sepolia
 */
export const networks: Record<number, NetworkConfig> = Object.fromEntries(
  allNetworks.map((n) => [n.chainId, n])
);

/**
 * Get network configuration by chain ID.
 * @throws Error if chain ID not found
 */
export function getNetwork(chainId: number): NetworkConfig {
  const network = networks[chainId];
  if (!network) {
    throw new Error(`Network not found for chain ID ${chainId}`);
  }
  return network;
}

/**
 * Get network configuration by chain ID, or undefined if not found.
 */
export function getNetworkOrUndefined(chainId: number): NetworkConfig | undefined {
  return networks[chainId];
}

/**
 * Check if a chain ID is supported.
 */
export function isSupportedChain(chainId: number): boolean {
  return chainId in networks;
}

/**
 * Get all supported chain IDs.
 */
export function getSupportedChainIds(): number[] {
  return allNetworks.map((n) => n.chainId);
}
