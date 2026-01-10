/**
 * Block explorer utilities.
 *
 * Generate explorer URLs for addresses and transactions.
 */

import type { Address, BridgeProvider } from '../types';
import { getNetworkOrUndefined } from '../networks';

/**
 * Get the block explorer URL for an address.
 *
 * @param chainId - The chain ID
 * @param address - The address
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerAddressUrl(chainId: number, address: Address | string): string | null {
  const network = getNetworkOrUndefined(chainId);
  const baseUrl = network?.explorer.url?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get the block explorer URL for a transaction.
 *
 * @param chainId - The chain ID
 * @param txHash - The transaction hash
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | null {
  const network = getNetworkOrUndefined(chainId);
  const baseUrl = network?.explorer.url?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the block explorer name for a chain.
 *
 * @param chainId - The chain ID
 * @returns The explorer name or 'Explorer' as default
 */
export function getExplorerName(chainId: number): string {
  const network = getNetworkOrUndefined(chainId);
  return network?.explorer.name ?? 'Explorer';
}

/**
 * Get the chain display name.
 *
 * @param chainId - The chain ID
 * @returns The chain name or 'Chain {id}' as default
 */
export function getChainName(chainId: number): string {
  const network = getNetworkOrUndefined(chainId);
  return network?.displayName ?? `Chain ${chainId}`;
}

/**
 * Get a short chain name for badges/compact display.
 *
 * @param chainId - The chain ID
 * @returns The short chain name or chain ID as string
 */
export function getChainShortName(chainId: number): string {
  const network = getNetworkOrUndefined(chainId);
  if (!network) return `#${chainId}`;

  // Local chains show as "Local"
  if (network.isLocal) return 'Local';

  return network.displayName;
}

// ═══════════════════════════════════════════════════════════════════════════
// BRIDGE EXPLORERS
// ═══════════════════════════════════════════════════════════════════════════

/** Bridge explorer configuration */
interface BridgeExplorerConfig {
  name: string;
  baseUrl: string;
  searchByTxUrl: (txHash: string) => string;
  messageUrl?: (messageId: string) => string;
}

/** Bridge explorer configurations */
const BRIDGE_EXPLORERS: Record<BridgeProvider, BridgeExplorerConfig> = {
  hyperlane: {
    name: 'Hyperlane Explorer',
    baseUrl: 'https://explorer.hyperlane.xyz',
    searchByTxUrl: (txHash) => `https://explorer.hyperlane.xyz/?search=${txHash}`,
    messageUrl: (messageId) => `https://explorer.hyperlane.xyz/?search=${messageId}`,
  },
  wormhole: {
    name: 'Wormhole Explorer',
    baseUrl: 'https://wormholescan.io',
    searchByTxUrl: (txHash) => `https://wormholescan.io/#/tx/${txHash}`,
  },
  ccip: {
    name: 'CCIP Explorer',
    baseUrl: 'https://ccip.chain.link',
    searchByTxUrl: (txHash) => `https://ccip.chain.link/msg/${txHash}`,
  },
};

/**
 * Get the bridge explorer name.
 */
export function getBridgeExplorerName(provider: BridgeProvider = 'hyperlane'): string {
  return BRIDGE_EXPLORERS[provider].name;
}

/**
 * Get the bridge explorer URL for a cross-chain message by origin transaction hash.
 *
 * @param originTxHash - The transaction hash on the origin chain
 * @param originChainId - Optional origin chain ID for chain validation
 * @param provider - Optional bridge provider override
 * @returns The explorer URL or null if chain is local
 */
export function getBridgeMessageUrl(
  originTxHash: string,
  originChainId?: number,
  provider: BridgeProvider = 'hyperlane'
): string | null {
  // Don't return URLs for local chains
  if (originChainId !== undefined) {
    const network = getNetworkOrUndefined(originChainId);
    if (network?.isLocal) return null;
  }

  return BRIDGE_EXPLORERS[provider].searchByTxUrl(originTxHash);
}

/**
 * Get the bridge explorer URL for a message by its ID.
 *
 * @param messageId - The cross-chain message ID
 * @param provider - Optional bridge provider override
 * @returns The explorer URL or null if message URLs not supported
 */
export function getBridgeMessageByIdUrl(
  messageId: string,
  provider: BridgeProvider = 'hyperlane'
): string | null {
  const config = BRIDGE_EXPLORERS[provider];
  return config.messageUrl?.(messageId) ?? null;
}
