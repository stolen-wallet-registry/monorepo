/**
 * Chain role configuration for the Stolen Wallet Registry.
 *
 * Hub = Base (where registrations settle)
 * Spoke = Everything else (bridges to hub)
 */

import { logger } from '@/lib/logger';

/** Base chain IDs - the only hub chains */
const HUB_CHAIN_IDS = [
  8453, // Base mainnet
  84532, // Base Sepolia
  31337, // Anvil Hub (local)
] as const;

export function isHubChain(chainId: number): boolean {
  return HUB_CHAIN_IDS.includes(chainId as (typeof HUB_CHAIN_IDS)[number]);
}

export function isSpokeChain(chainId: number): boolean {
  return !isHubChain(chainId);
}

/** Get the hub chain ID for any spoke. Returns undefined if already on hub or unknown. */
export function getHubChainId(chainId: number): number | undefined {
  if (isHubChain(chainId)) return undefined;

  // Map spoke to its hub based on environment
  if (chainId === 10) return 8453; // Optimism mainnet → Base mainnet
  if (chainId === 11155420) return 84532; // Optimism Sepolia → Base Sepolia
  if (chainId === 31338) return 31337; // Anvil Spoke → Anvil Hub

  // Unknown spoke - callers must handle explicitly
  logger.wallet.warn('Unknown spoke chain, no hub mapping found', { chainId });
  return undefined;
}
