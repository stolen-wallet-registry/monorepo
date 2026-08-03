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
// EXAMPLE CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════

// Placeholder flagged contract - a known scam contract address (example only)
export const EXAMPLE_FLAGGED_CONTRACT = '0x00000000000000000000000000000000DeaDBeef';

// Clean contract - using Uniswap V2 Router as a well-known legitimate contract
export const EXAMPLE_CLEAN_CONTRACT = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

// ═══════════════════════════════════════════════════════════════════════════
// INDEXER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Ponder indexer URL
// In production, this should point to the deployed indexer
// For development, it defaults to localhost
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? 'http://localhost:42069';

// A production build that silently falls back to localhost gives every visitor a hero search
// that can never return a result — the requests go to the visitor's own machine.
//
// The `typeof window === 'undefined'` guard is load-bearing. This module lives in a
// `'use client'` tree, and Next inlines both NEXT_PUBLIC_* and NODE_ENV into the CLIENT
// bundle as well as the server one — so without the guard this warning is evaluated in every
// visitor's browser on every page load, printing to their console instead of the deploy log.
// The guard restricts it to the build/SSR pass, which is where a misconfigured deploy is
// actually actionable.
if (
  typeof window === 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_INDEXER_URL
) {
  console.warn(
    '[landing] NEXT_PUBLIC_INDEXER_URL is not set — the registry search preview will point at ' +
      'http://localhost:42069 and return nothing for visitors. Set it in the deployment environment.'
  );
}

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
