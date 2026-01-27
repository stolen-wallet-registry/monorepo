/**
 * Chain display utilities.
 *
 * Provides chain display info (name, color) by combining:
 * - Chain names from wagmi config (single source of truth)
 * - Color mapping for UI indicators
 */

import { config } from './wagmi';
import {
  getCAIP2ChainName,
  getChainName,
  getChainShortName,
  getNetworkOrUndefined,
  isLocalChain,
  parseCAIP2,
} from '@swr/chains';

/** Tailwind color classes for chain indicators */
const CHAIN_COLORS: Record<number, string> = {
  1: 'bg-blue-500', // Ethereum
  10: 'bg-red-500', // Optimism
  137: 'bg-purple-500', // Polygon
  42161: 'bg-blue-400', // Arbitrum
  8453: 'bg-blue-600', // Base
  84532: 'bg-blue-400', // Base Sepolia
  11155420: 'bg-red-400', // Optimism Sepolia
  31337: 'bg-blue-500', // Anvil Hub (local)
  31338: 'bg-green-500', // Anvil Spoke (local)
};

const DEFAULT_COLOR = 'bg-gray-500';

export interface ChainDisplayInfo {
  id: number;
  name: string;
  color: string;
}

export interface Caip2ChainDisplayInfo {
  chainId: number | null;
  shortName: string;
  displayName: string;
  caip2: string | null;
  isKnown: boolean;
  isLocal: boolean;
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

/**
 * Get display info for CAIP-2 identifiers using @swr/chains as the source of truth.
 */
export function getChainDisplayFromCaip2(caip2?: string): Caip2ChainDisplayInfo {
  if (!caip2) {
    return {
      chainId: null,
      shortName: 'Unknown',
      displayName: 'Unknown',
      caip2: null,
      isKnown: false,
      isLocal: false,
    };
  }

  const parsed = parseCAIP2(caip2);
  if (parsed && parsed.namespace === 'eip155' && /^\d+$/.test(parsed.chainId)) {
    const chainId = parseInt(parsed.chainId, 10);
    if (Number.isFinite(chainId)) {
      return {
        chainId,
        shortName: getChainShortName(chainId),
        displayName: getChainName(chainId),
        caip2,
        isKnown: !!getNetworkOrUndefined(chainId),
        isLocal: isLocalChain(chainId),
      };
    }
  }

  const name = getCAIP2ChainName(caip2);
  return {
    chainId: null,
    shortName: name,
    displayName: name,
    caip2,
    isKnown: false,
    isLocal: false,
  };
}
