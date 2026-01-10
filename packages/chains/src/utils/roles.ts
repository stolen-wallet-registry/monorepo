/**
 * Chain role utilities.
 *
 * Determine if a chain is a hub or spoke, and get related chain IDs.
 */

import type { NetworkConfig, HubNetworkConfig, SpokeNetworkConfig } from '../types';
import { getNetworkOrUndefined, allNetworks } from '../networks';

/**
 * Check if a chain is a hub chain.
 * @param chainId - The chain ID to check
 * @returns true if the chain is a hub
 */
export function isHubChain(chainId: number): boolean {
  const network = getNetworkOrUndefined(chainId);
  return network?.role === 'hub';
}

/**
 * Check if a chain is a spoke chain.
 * @param chainId - The chain ID to check
 * @returns true if the chain is a spoke
 */
export function isSpokeChain(chainId: number): boolean {
  const network = getNetworkOrUndefined(chainId);
  return network?.role === 'spoke';
}

/**
 * Check if a chain is a local development chain.
 * @param chainId - The chain ID to check
 * @returns true if the chain is local
 */
export function isLocalChain(chainId: number): boolean {
  const network = getNetworkOrUndefined(chainId);
  return network?.isLocal ?? false;
}

/**
 * Check if a chain is a testnet.
 * @param chainId - The chain ID to check
 * @returns true if the chain is a testnet
 */
export function isTestnet(chainId: number): boolean {
  const network = getNetworkOrUndefined(chainId);
  return network?.isTestnet ?? false;
}

/**
 * Get the hub chain ID for a spoke chain.
 * @param chainId - The spoke chain ID
 * @returns The hub chain ID, or undefined if already on hub or unknown chain
 */
export function getHubChainId(chainId: number): number | undefined {
  const network = getNetworkOrUndefined(chainId);
  if (!network) return undefined;

  if (network.role === 'hub') return undefined;

  // TypeScript narrows to SpokeNetworkConfig after the hub check
  return network.hubChainId;
}

/**
 * Get all spoke chain IDs that bridge to a hub.
 * @param hubChainId - The hub chain ID
 * @returns Array of spoke chain IDs
 */
export function getSpokeChainIds(hubChainId: number): number[] {
  return allNetworks
    .filter((n): n is SpokeNetworkConfig => n.role === 'spoke' && n.hubChainId === hubChainId)
    .map((n) => n.chainId);
}

/**
 * Get all hub chains.
 */
export function getHubChains(): HubNetworkConfig[] {
  return allNetworks.filter((n): n is HubNetworkConfig => n.role === 'hub');
}

/**
 * Get all spoke chains.
 */
export function getSpokeChains(): SpokeNetworkConfig[] {
  return allNetworks.filter((n): n is SpokeNetworkConfig => n.role === 'spoke');
}

/**
 * Get all local development chains.
 */
export function getLocalChains(): NetworkConfig[] {
  return allNetworks.filter((n) => n.isLocal);
}

/**
 * Get all local development chain IDs.
 */
export function getLocalChainIds(): number[] {
  return allNetworks.filter((n) => n.isLocal).map((n) => n.chainId);
}

/**
 * Get all testnet chains.
 */
export function getTestnetChains(): NetworkConfig[] {
  return allNetworks.filter((n) => n.isTestnet);
}

/**
 * Get all mainnet chains (not local, not testnet).
 */
export function getMainnetChains(): NetworkConfig[] {
  return allNetworks.filter((n) => !n.isLocal && !n.isTestnet);
}
