/**
 * Network configuration aggregator.
 *
 * All supported networks with lookup by chain ID.
 */

import type { NetworkConfig } from '../types';

import { anvilHub } from './anvil-hub';
import { anvilSpoke } from './anvil-spoke';
import { base } from './base';
import { baseSepolia } from './base-sepolia';
import { optimism } from './optimism';
import { optimismSepolia } from './optimism-sepolia';

// Re-export individual network configs
export { anvilHub, anvilSpoke, base, baseSepolia, optimism, optimismSepolia };

/**
 * Deep freeze an object and all nested objects.
 */
function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * All supported networks (frozen to prevent runtime mutation).
 */
const _allNetworks: readonly NetworkConfig[] = [
  anvilHub,
  anvilSpoke,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
];

// Validate no duplicate chain IDs at module init and deep freeze each network
const seenChainIds = new Set<number>();
for (const network of _allNetworks) {
  if (seenChainIds.has(network.chainId)) {
    throw new Error(
      `Duplicate chainId ${network.chainId} detected in allNetworks. ` +
        `Each network must have a unique chainId.`
    );
  }
  seenChainIds.add(network.chainId);
  deepFreeze(network);
}

export const allNetworks: readonly NetworkConfig[] = Object.freeze(_allNetworks);

/**
 * Cached array of supported chain IDs (computed once at module init).
 * Since allNetworks is frozen and uniqueness is validated above, no Set needed.
 */
const _supportedChainIds: readonly number[] = Object.freeze(_allNetworks.map((n) => n.chainId));

/**
 * Network lookup by chain ID (null-prototype, frozen for safety).
 *
 * @example
 * const config = networks[84532]; // Base Sepolia
 */
const _networks: Record<number, NetworkConfig> = Object.create(null);
for (const n of _allNetworks) _networks[n.chainId] = n;
export const networks: Readonly<Record<number, NetworkConfig>> = Object.freeze(_networks);

/**
 * Get network configuration by chain ID.
 * @throws Error if chain ID not found (includes supported IDs in message)
 */
export function getNetwork(chainId: number): NetworkConfig {
  const network = getNetworkOrUndefined(chainId);
  if (!network) {
    throw new Error(
      `Network not found for chain ID ${chainId}. Supported: ${getSupportedChainIds().join(', ')}`
    );
  }
  return network;
}

/**
 * Get network configuration by chain ID, or undefined if not found.
 */
export function getNetworkOrUndefined(chainId: number): NetworkConfig | undefined {
  return Object.prototype.hasOwnProperty.call(_networks, chainId) ? _networks[chainId] : undefined;
}

/**
 * Check if a chain ID is supported.
 */
export function isSupportedChain(chainId: number): boolean {
  return Object.prototype.hasOwnProperty.call(_networks, chainId);
}

/**
 * Get all supported chain IDs.
 * Returns a new array copy of the cached chain IDs.
 */
export function getSupportedChainIds(): number[] {
  return [..._supportedChainIds];
}
