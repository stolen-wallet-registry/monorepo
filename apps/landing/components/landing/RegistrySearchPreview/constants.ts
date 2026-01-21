/**
 * Configuration for the registry search preview.
 */

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE WALLET ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════

// Placeholder - will show "not found" until we register a demo wallet
// Using the dead address as a known example
export const EXAMPLE_REGISTERED_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Any valid address not in registry - using a well-known Ethereum foundation address
export const EXAMPLE_CLEAN_ADDRESS = '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE TRANSACTION HASHES
// ═══════════════════════════════════════════════════════════════════════════

// Placeholder - update with an actual reported transaction hash from your indexer
export const EXAMPLE_REPORTED_TX =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

// Any valid tx hash not in registry - using a placeholder
export const EXAMPLE_CLEAN_TX =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// ═══════════════════════════════════════════════════════════════════════════
// INDEXER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Ponder indexer URL
// In production, this should point to the deployed indexer
// For development, it defaults to localhost
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? 'http://localhost:42069';

// Hub chain ID for explorer links
// Prefer explicit env var, fall back to mode-based selection
// Base mainnet (8453) for production, Base Sepolia (84532) for development/staging
function getHubChainId(): number {
  // Explicit env var takes precedence
  const envChainId = process.env.NEXT_PUBLIC_HUB_CHAIN_ID;
  if (envChainId) {
    const parsed = parseInt(envChainId, 10);
    if (!isNaN(parsed)) return parsed;
  }

  // Fall back to mode-based selection
  // Use NEXT_PUBLIC_VERCEL_ENV for Vercel deployments, otherwise check NODE_ENV
  const isProduction =
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  return isProduction ? 8453 : 84532;
}

export const HUB_CHAIN_ID = getHubChainId();
