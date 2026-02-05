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
  // Local Anvil chains - V2 deployment addresses (DeployV2.s.sol)
  // Different from V1 due to different deployment order
  31337: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6', // Hub chain (V2)
  31338: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853', // Spoke chain (V2)
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
 * @throws Error if local chain is missing Multicall3 address mapping
 *
 * Configures multicall3 for all chains:
 * - Local Anvil uses deterministic addresses from deployment script
 * - All other chains use the canonical multicall3 address
 *
 * IMPORTANT: If you add a new local chain, you MUST add its Multicall3 address
 * to MULTICALL3_ADDRESSES. The canonical address won't exist on local chains.
 * This has caused issues during local development - the guard below prevents
 * silent fallback to a non-existent address.
 */
export function toWagmiChain(config: NetworkConfig): Chain {
  // Guard: Local chains MUST have explicit Multicall3 address mapping
  // Canonical address doesn't exist on fresh Anvil instances
  if (config.isLocal && !MULTICALL3_ADDRESSES[config.chainId]) {
    throw new Error(
      `Missing Multicall3 address for local chain ${config.chainId} (${config.displayName}). ` +
        `Add it to MULTICALL3_ADDRESSES in packages/chains/src/utils/wagmi.ts`
    );
  }

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
