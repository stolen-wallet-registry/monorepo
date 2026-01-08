/**
 * Block explorer URL utilities.
 *
 * Generates explorer URLs for transactions and addresses.
 * Chain info is derived from wagmi config to avoid duplicate configuration.
 */

import { config } from './wagmi';
import type { Address, Hash } from '@/lib/types/ethereum';

/**
 * Find a chain by ID from wagmi config.
 */
function findChain(chainId: number) {
  return config.chains.find((c) => c.id === chainId);
}

/**
 * Get the block explorer URL for a transaction.
 *
 * @param chainId - The chain ID
 * @param txHash - The transaction hash
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerTxUrl(chainId: number, txHash: Hash): string | null {
  const chain = findChain(chainId);
  const baseUrl = chain?.blockExplorers?.default?.url?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get the block explorer URL for an address.
 *
 * @param chainId - The chain ID
 * @param address - The address
 * @returns The explorer URL or null if no explorer configured
 */
export function getExplorerAddressUrl(chainId: number, address: Address): string | null {
  const chain = findChain(chainId);
  const baseUrl = chain?.blockExplorers?.default?.url?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/address/${address}`;
}

/**
 * Get the block explorer name for a chain.
 *
 * @param chainId - The chain ID
 * @returns The explorer name or "Explorer" as default
 */
export function getExplorerName(chainId: number): string {
  const chain = findChain(chainId);
  return chain?.blockExplorers?.default?.name ?? 'Explorer';
}

/**
 * Get the full chain name for a chain ID.
 *
 * @param chainId - The chain ID
 * @returns The chain name or "Chain {id}" as default
 */
export function getChainName(chainId: number): string {
  const chain = findChain(chainId);
  return chain?.name ?? `Chain ${chainId}`;
}

/**
 * Get the short chain name for a chain ID (for badges/compact display).
 *
 * @param chainId - The chain ID
 * @returns The short chain name or chain ID as string
 */
export function getChainShortName(chainId: number): string {
  const chain = findChain(chainId);
  if (!chain) return `#${chainId}`;

  // Special case: localhost/anvil chains show as "Local"
  const name = chain.name.toLowerCase();
  if (name.includes('localhost') || name.includes('anvil')) {
    return 'Local';
  }

  // Default: use chain name (wagmi names are typically short enough)
  return chain.name;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN BRIDGE EXPLORERS
// ═══════════════════════════════════════════════════════════════════════════

/** Supported bridge providers */
export type BridgeProvider = 'hyperlane' | 'wormhole' | 'ccip';

/** Bridge explorer configuration */
interface BridgeExplorerConfig {
  name: string;
  /** Base URL for the explorer */
  baseUrl: string;
  /** URL pattern for searching by origin tx hash */
  searchByTxUrl: (txHash: Hash) => string;
  /** URL pattern for message ID (if supported) */
  messageUrl?: (messageId: string) => string;
  /** Chains this explorer supports (empty = all chains) */
  supportedChains?: number[];
  /** Chains to exclude (e.g., local dev chains) */
  excludedChains?: number[];
}

/** Bridge explorer configurations (exported for testability) */
export const BRIDGE_EXPLORERS: Record<BridgeProvider, BridgeExplorerConfig> = {
  hyperlane: {
    name: 'Hyperlane Explorer',
    baseUrl: 'https://explorer.hyperlane.xyz',
    searchByTxUrl: (txHash) => `https://explorer.hyperlane.xyz/?search=${txHash}`,
    // Message ID lookup uses search interface for consistency
    messageUrl: (messageId) => `https://explorer.hyperlane.xyz/?search=${messageId}`,
    // Exclude local anvil chains - no Hyperlane explorer for local dev
    excludedChains: [31337, 31338],
  },
  wormhole: {
    name: 'Wormhole Explorer',
    baseUrl: 'https://wormholescan.io',
    searchByTxUrl: (txHash) => `https://wormholescan.io/#/tx/${txHash}`,
    excludedChains: [31337, 31338],
  },
  ccip: {
    name: 'CCIP Explorer',
    baseUrl: 'https://ccip.chain.link',
    // CCIP uses query param for search
    searchByTxUrl: (txHash) => `https://ccip.chain.link/?search=${txHash}`,
    excludedChains: [31337, 31338],
  },
};

/**
 * Get list of supported bridge providers for testability.
 */
export function getSupportedBridgeProviders(): BridgeProvider[] {
  return Object.keys(BRIDGE_EXPLORERS) as BridgeProvider[];
}

/**
 * Get the current bridge provider for cross-chain messaging.
 * This could be made dynamic based on chain or config in the future.
 */
export function getBridgeProvider(): BridgeProvider {
  // Currently using Hyperlane for all cross-chain messaging
  // This could read from env or chain config in the future
  return 'hyperlane';
}

/**
 * Get the bridge explorer name.
 */
export function getBridgeExplorerName(provider?: BridgeProvider): string {
  const p = provider ?? getBridgeProvider();
  return BRIDGE_EXPLORERS[p].name;
}

/**
 * Get the bridge explorer URL for a cross-chain message by origin transaction hash.
 *
 * @param originTxHash - The transaction hash on the origin (spoke) chain
 * @param originChainId - Optional origin chain ID for chain validation. When provided,
 *   the function checks if the chain is excluded or not in the supported list.
 *   When omitted, chain validation is skipped and a URL is always generated.
 *   This allows URL generation without chain context (e.g., for display purposes).
 * @param provider - Optional bridge provider override
 * @returns The explorer URL or null if chain is excluded/unsupported
 */
export function getBridgeMessageUrl(
  originTxHash: Hash,
  originChainId?: number,
  provider?: BridgeProvider
): string | null {
  const p = provider ?? getBridgeProvider();
  const explorerConfig = BRIDGE_EXPLORERS[p];

  // Check if this chain is excluded (e.g., local dev)
  if (originChainId !== undefined && explorerConfig.excludedChains?.includes(originChainId)) {
    return null;
  }

  // Check if this chain is in the supported list (if specified)
  if (
    originChainId !== undefined &&
    explorerConfig.supportedChains &&
    !explorerConfig.supportedChains.includes(originChainId)
  ) {
    return null;
  }

  return explorerConfig.searchByTxUrl(originTxHash);
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
  provider?: BridgeProvider
): string | null {
  const p = provider ?? getBridgeProvider();
  const explorerConfig = BRIDGE_EXPLORERS[p];

  if (!explorerConfig.messageUrl) {
    return null;
  }

  return explorerConfig.messageUrl(messageId);
}
