/**
 * Chain role configuration - re-exported from @swr/chains.
 */

// Re-export everything from @swr/chains for backward compatibility
export {
  isHubChain,
  isSpokeChain,
  getHubChainId,
  hubChainIds as HUB_CHAIN_IDS,
  getChainName,
} from '@swr/chains';

import { logger } from '@/lib/logger';
import { hubChainIds } from '@swr/chains';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT-BASED HUB CHAIN
// ═══════════════════════════════════════════════════════════════════════════

const ALL_HUB_CHAIN_IDS = Object.values(hubChainIds);

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
    if (!isNaN(parsed) && ALL_HUB_CHAIN_IDS.includes(parsed)) {
      return parsed;
    }
    logger.wallet.warn('Invalid VITE_HUB_CHAIN_ID, using default', { envOverride });
  }

  // 2. Check for staging mode (Vite --mode staging or VITE_MODE=staging)
  const mode = import.meta.env.MODE;
  if (mode === 'staging' || mode === 'testnet') {
    return hubChainIds.staging;
  }

  // 3. Standard DEV/PROD detection
  if (import.meta.env.DEV) {
    return hubChainIds.development;
  }

  return hubChainIds.production;
}
