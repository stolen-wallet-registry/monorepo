/**
 * Bridge configuration utilities.
 *
 * Helper functions for working with multi-bridge configurations.
 */

import type {
  Address,
  BridgeProvider,
  HyperlaneBridgeConfig,
  WormholeBridgeConfig,
  CcipBridgeConfig,
} from '../types';
import { getNetworkOrUndefined } from '../networks';

// ═══════════════════════════════════════════════════════════════════════════
// BRIDGE PROVIDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the primary bridge provider for a chain.
 *
 * @param chainId - The chain ID
 * @returns The primary bridge provider or null if no bridges configured
 */
export function getPrimaryBridgeProvider(chainId: number): BridgeProvider | null {
  const network = getNetworkOrUndefined(chainId);
  return network?.bridges?.primary ?? null;
}

/**
 * Get all supported bridge providers for a chain.
 *
 * @param chainId - The chain ID
 * @returns Array of configured bridge providers
 */
export function getSupportedBridgeProviders(chainId: number): BridgeProvider[] {
  const network = getNetworkOrUndefined(chainId);
  if (!network?.bridges) return [];

  const providers: BridgeProvider[] = [];
  if (network.bridges.hyperlane) providers.push('hyperlane');
  if (network.bridges.wormhole) providers.push('wormhole');
  if (network.bridges.ccip) providers.push('ccip');

  return providers;
}

/**
 * Check if a bridge provider is supported on a chain.
 *
 * @param chainId - The chain ID
 * @param provider - The bridge provider to check
 * @returns true if the provider is configured for this chain
 */
export function isBridgeProviderSupported(chainId: number, provider: BridgeProvider): boolean {
  const network = getNetworkOrUndefined(chainId);
  if (!network?.bridges) return false;
  return network.bridges[provider] !== undefined;
}

/**
 * Check if a chain has any bridge configuration.
 *
 * @param chainId - The chain ID
 * @returns true if bridges are configured
 */
export function hasBridgeSupport(chainId: number): boolean {
  const network = getNetworkOrUndefined(chainId);
  return network?.bridges !== undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// HYPERLANE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Hyperlane configuration for a chain.
 *
 * @param chainId - The chain ID
 * @returns Hyperlane config or null if not configured
 */
export function getHyperlaneConfig(chainId: number): HyperlaneBridgeConfig | null {
  const network = getNetworkOrUndefined(chainId);
  return network?.bridges?.hyperlane ?? null;
}

/**
 * Get Hyperlane mailbox address for a chain.
 *
 * @param chainId - The chain ID
 * @returns Mailbox address or null
 */
export function getHyperlaneMailbox(chainId: number): Address | null {
  return getHyperlaneConfig(chainId)?.mailbox ?? null;
}

/**
 * Get Hyperlane IGP (Interchain Gas Paymaster) address for a chain.
 *
 * @param chainId - The chain ID
 * @returns IGP address or null
 */
export function getHyperlaneIgp(chainId: number): Address | null {
  return getHyperlaneConfig(chainId)?.igp ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORMHOLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Wormhole configuration for a chain.
 *
 * @param chainId - The chain ID
 * @returns Wormhole config or null if not configured
 */
export function getWormholeConfig(chainId: number): WormholeBridgeConfig | null {
  const network = getNetworkOrUndefined(chainId);
  return network?.bridges?.wormhole ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CCIP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Chainlink CCIP configuration for a chain.
 *
 * @param chainId - The chain ID
 * @returns CCIP config or null if not configured
 */
export function getCcipConfig(chainId: number): CcipBridgeConfig | null {
  const network = getNetworkOrUndefined(chainId);
  return network?.bridges?.ccip ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// BRIDGE ADAPTER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the bridge adapter address for a spoke chain.
 *
 * @param chainId - The spoke chain ID
 * @param provider - The bridge provider (defaults to primary)
 * @returns Adapter address or null if not deployed
 */
export function getBridgeAdapterAddress(
  chainId: number,
  provider?: BridgeProvider
): Address | null {
  const network = getNetworkOrUndefined(chainId);
  if (network?.role !== 'spoke' || !network.spokeContracts) return null;

  const bridgeProvider = provider ?? network.bridges?.primary;
  if (!bridgeProvider) return null;

  return network.spokeContracts.bridgeAdapters?.[bridgeProvider] ?? null;
}

/**
 * Get all bridge adapter addresses for a spoke chain.
 *
 * @param chainId - The spoke chain ID
 * @returns Map of provider to adapter address
 */
export function getAllBridgeAdapters(chainId: number): Partial<Record<BridgeProvider, Address>> {
  const network = getNetworkOrUndefined(chainId);
  if (network?.role !== 'spoke' || !network.spokeContracts) return {};
  return network.spokeContracts.bridgeAdapters ?? {};
}
