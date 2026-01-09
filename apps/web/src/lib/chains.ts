/**
 * Chain display utilities.
 *
 * Provides chain display info (name, color) by combining:
 * - Chain names from wagmi config (single source of truth)
 * - Color mapping for UI indicators
 */

import { config } from './wagmi';

/** Tailwind color classes for chain indicators */
const CHAIN_COLORS: Record<number, string> = {
  1: 'bg-blue-500', // Ethereum
  10: 'bg-red-500', // Optimism
  137: 'bg-purple-500', // Polygon
  42161: 'bg-blue-400', // Arbitrum
  8453: 'bg-blue-600', // Base
  11155111: 'bg-purple-400', // Sepolia
  31337: 'bg-blue-500', // Anvil Hub (local)
  31338: 'bg-green-500', // Anvil Spoke (local)
};

const DEFAULT_COLOR = 'bg-gray-500';

export interface ChainDisplayInfo {
  id: number;
  name: string;
  color: string;
}

/**
 * Get chain display info by chain ID.
 * Names come from wagmi config, colors from local mapping.
 */
export function getChainDisplayInfo(chainId: number): ChainDisplayInfo {
  const chain = config.chains.find((c) => c.id === chainId);
  return {
    id: chainId,
    name: chain?.name ?? `Chain ${chainId}`,
    color: CHAIN_COLORS[chainId] ?? DEFAULT_COLOR,
  };
}
