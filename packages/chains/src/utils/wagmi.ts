/**
 * wagmi chain utilities.
 *
 * Convert NetworkConfig to wagmi Chain type for use with wagmi/viem.
 */

import type { Chain } from 'viem';
import type { NetworkConfig } from '../types';
import { getNetworkOrUndefined, allNetworks } from '../networks';

/**
 * Standard multicall3 address deployed on Anvil and most EVM chains.
 * @see https://github.com/mds1/multicall
 */
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * Convert a NetworkConfig to a wagmi/viem Chain object.
 *
 * @param config - The network configuration
 * @returns A wagmi-compatible Chain object
 */
export function toWagmiChain(config: NetworkConfig): Chain {
  return {
    id: config.chainId,
    name: config.displayName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: [...config.rpcUrls] },
    },
    blockExplorers: config.explorer.url
      ? {
          default: {
            name: config.explorer.name,
            url: config.explorer.url,
            apiUrl: config.explorer.apiUrl,
          },
        }
      : undefined,
    // Add multicall3 contract for local chains (Anvil has it at standard address)
    contracts: config.isLocal
      ? {
          multicall3: {
            address: MULTICALL3_ADDRESS,
          },
        }
      : undefined,
    testnet: config.isTestnet || config.isLocal,
  };
}

/**
 * Convert a chain ID to a wagmi/viem Chain object.
 *
 * @param chainId - The chain ID
 * @returns A wagmi-compatible Chain object
 * @throws Error if chain ID not found
 */
export function toWagmiChainById(chainId: number): Chain {
  const config = getNetworkOrUndefined(chainId);
  if (!config) {
    throw new Error(`Network not found for chain ID ${chainId}`);
  }
  return toWagmiChain(config);
}

/**
 * Get wagmi chains for an array of chain IDs.
 *
 * @param chainIds - Array of chain IDs
 * @returns Array of wagmi-compatible Chain objects
 */
export function getWagmiChains(chainIds: number[]): Chain[] {
  return chainIds.map(toWagmiChainById);
}

/**
 * Get all supported chains as wagmi Chain objects.
 */
export function getAllWagmiChains(): Chain[] {
  return allNetworks.map(toWagmiChain);
}

/**
 * Get the primary RPC URL for a chain.
 *
 * @param chainId - The chain ID
 * @returns The primary RPC URL or undefined if not found
 */
export function getRpcUrl(chainId: number): string | undefined {
  const config = getNetworkOrUndefined(chainId);
  return config?.rpcUrls[0];
}

/**
 * Get all RPC URLs for a chain.
 *
 * @param chainId - The chain ID
 * @returns Array of RPC URLs or empty array if not found
 */
export function getRpcUrls(chainId: number): readonly string[] {
  const config = getNetworkOrUndefined(chainId);
  return config?.rpcUrls ?? [];
}
