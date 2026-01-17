/**
 * wagmi chain utilities.
 *
 * Convert NetworkConfig to wagmi Chain type for use with wagmi/viem.
 */

import type { Chain } from 'viem';
import type { NetworkConfig } from '../types';
import { getNetworkOrUndefined, allNetworks } from '../networks';

/**
 * Multicall3 addresses per chain.
 *
 * Canonical address for most chains: 0xcA11bde05977b3631167028862bE2a173976CA11
 * (CREATE2-based, deployed by Multicall3 team)
 *
 * Local Anvil chains use deterministic addresses from our cross-chain deployment
 * script (DeployCrossChain.s.sol). These are CREATE (nonce-dependent) addresses
 * that remain fixed due to our deployment process always using the same nonces.
 */
const MULTICALL3_ADDRESSES: Record<number, `0x${string}`> = {
  // Local Anvil chains - deterministic cross-chain deployment addresses
  31337: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318', // Hub chain
  31338: '0x0165878A594ca255338adfa4d48449f69242Eb8F', // Spoke chain
  // All other chains use canonical address (pre-deployed)
};

const CANONICAL_MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * Get the Multicall3 address for a given chain ID.
 *
 * Uses static deterministic addresses - no env var overrides needed.
 */
function getMulticall3Address(chainId: number): `0x${string}` {
  return MULTICALL3_ADDRESSES[chainId] ?? CANONICAL_MULTICALL3;
}

/**
 * Convert a NetworkConfig to a wagmi/viem Chain object.
 *
 * @param config - The network configuration
 * @returns A wagmi-compatible Chain object
 *
 * Configures multicall3 for all chains:
 * - Local Anvil uses deterministic addresses from deployment script
 * - All other chains use the canonical multicall3 address
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
    contracts: {
      multicall3: {
        address: getMulticall3Address(config.chainId),
      },
    },
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
