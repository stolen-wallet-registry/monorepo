/**
 * wagmi chain utilities.
 *
 * Convert NetworkConfig to wagmi Chain type for use with wagmi/viem.
 */

import { isAddress, type Chain } from 'viem';
import type { NetworkConfig } from '../types';
import { getNetworkOrUndefined, allNetworks } from '../networks';

/**
 * Multicall3 addresses per chain.
 *
 * Canonical address for most chains: 0xcA11bde05977b3631167028862bE2a173976CA11
 *
 * Local Anvil chains use our deployed addresses (varies by deploy script):
 * - deploy:crosschain (DeployCrossChain.s.sol):
 *   - Hub (31337): 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
 *   - Spoke (31338): 0x0165878A594ca255338adfa4d48449f69242Eb8F
 * - deploy (Deploy.s.sol, single-chain):
 *   - Hub (31337): 0x9A676e781A523b5d0C0e43731313A708CB607508
 *
 * IMPORTANT: The default addresses below are for cross-chain deployment.
 * For single-chain development, set VITE_MULTICALL3_ADDRESS=0x9A676e781A523b5d0C0e43731313A708CB607508
 * in your .env.local file to use the single-chain deployed address.
 *
 * Which script to use:
 * - `pnpm deploy` (single-chain) - For simple local development
 * - `pnpm deploy:crosschain` - For testing cross-chain features
 */
const MULTICALL3_ADDRESSES: Record<number, `0x${string}`> = {
  // Local Anvil chains - cross-chain deployment addresses (default)
  // Override via VITE_MULTICALL3_ADDRESS env var for single-chain development
  31337: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
  31338: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  // All other chains use canonical address (pre-deployed)
};

const CANONICAL_MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * Get the Multicall3 address for a given chain ID.
 *
 * For local development, allows env overrides scoped to a chain ID.
 * - VITE_MULTICALL3_ADDRESS_31337 applies only to chain 31337.
 * - VITE_MULTICALL3_ADDRESS (legacy) only applies to chain 31337.
 * If not set, uses the hardcoded addresses for cross-chain deployment.
 */
function getMulticall3Address(chainId: number): `0x${string}` {
  // Allow env override for local development (supports both deploy scripts)
  if (typeof import.meta !== 'undefined') {
    const env = (import.meta as { env?: Record<string, string> }).env ?? {};
    const scopedKey = `VITE_MULTICALL3_ADDRESS_${chainId}`;
    const scopedAddress = env[scopedKey];
    const envAddress = chainId === 31337 ? env.VITE_MULTICALL3_ADDRESS : undefined;
    // Use viem's isAddress for proper validation (0x + 40 hex chars, checksum-aware)
    if (scopedAddress && isAddress(scopedAddress)) {
      return scopedAddress;
    }
    if (envAddress && isAddress(envAddress)) {
      return envAddress;
    }
  }
  return MULTICALL3_ADDRESSES[chainId] ?? CANONICAL_MULTICALL3;
}

/**
 * Convert a NetworkConfig to a wagmi/viem Chain object.
 *
 * @param config - The network configuration
 * @returns A wagmi-compatible Chain object
 *
 * Configures multicall3 for all chains:
 * - Local Anvil uses our deployed address (configurable via env var)
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
