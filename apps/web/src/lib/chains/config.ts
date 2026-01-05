/**
 * Chain role configuration for the Stolen Wallet Registry.
 *
 * Hub = Base (where registrations settle)
 * Spoke = Everything else (bridges to hub)
 *
 * Environment configuration:
 * - development: Anvil Hub (31337)
 * - staging/testnet: Base Sepolia (84532)
 * - production: Base mainnet (8453)
 *
 * Override with VITE_HUB_CHAIN_ID environment variable.
 */

import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// HUB CHAIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/** Hub chain IDs by environment */
export const HUB_CHAIN_IDS = {
  development: 31337, // Anvil Hub (local)
  staging: 84532, // Base Sepolia (testnet)
  production: 8453, // Base mainnet
} as const;

/** All valid hub chain IDs */
const ALL_HUB_CHAIN_IDS = Object.values(HUB_CHAIN_IDS);

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN ROLE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function isHubChain(chainId: number): boolean {
  return ALL_HUB_CHAIN_IDS.includes(chainId as (typeof ALL_HUB_CHAIN_IDS)[number]);
}

export function isSpokeChain(chainId: number): boolean {
  return !isHubChain(chainId);
}

/** Get the hub chain ID for any spoke. Returns undefined if already on hub or unknown. */
export function getHubChainId(chainId: number): number | undefined {
  if (isHubChain(chainId)) return undefined;

  // Map spoke to its hub based on environment
  if (chainId === 10) return HUB_CHAIN_IDS.production; // Optimism mainnet → Base mainnet
  if (chainId === 11155420) return HUB_CHAIN_IDS.staging; // Optimism Sepolia → Base Sepolia
  if (chainId === 31338) return HUB_CHAIN_IDS.development; // Anvil Spoke → Anvil Hub

  // Unknown spoke - callers must handle explicitly
  logger.wallet.warn('Unknown spoke chain, no hub mapping found', { chainId });
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT-BASED HUB CHAIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the hub chain ID for the current environment.
 * Used for unified registry queries that should always target the hub.
 *
 * Priority:
 * 1. VITE_HUB_CHAIN_ID env var (explicit override)
 * 2. VITE_MODE-based detection (staging → Base Sepolia)
 * 3. DEV/PROD detection (dev → Anvil, prod → Base mainnet)
 */
export function getHubChainIdForEnvironment(): number {
  // 1. Explicit override via env var
  const envOverride = import.meta.env.VITE_HUB_CHAIN_ID;
  if (envOverride) {
    const parsed = parseInt(envOverride, 10);
    if (
      !isNaN(parsed) &&
      ALL_HUB_CHAIN_IDS.includes(parsed as (typeof ALL_HUB_CHAIN_IDS)[number])
    ) {
      return parsed;
    }
    logger.wallet.warn('Invalid VITE_HUB_CHAIN_ID, using default', { envOverride });
  }

  // 2. Check for staging mode (Vite --mode staging or VITE_MODE=staging)
  const mode = import.meta.env.MODE;
  if (mode === 'staging' || mode === 'testnet') {
    return HUB_CHAIN_IDS.staging;
  }

  // 3. Standard DEV/PROD detection
  if (import.meta.env.DEV) {
    return HUB_CHAIN_IDS.development;
  }

  return HUB_CHAIN_IDS.production;
}
