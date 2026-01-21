/**
 * Configuration for the registry search preview.
 */

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════

// Placeholder - will show "not found" until we register a demo wallet
// Using the dead address as a known example
export const EXAMPLE_REGISTERED_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Any valid address not in registry - using a well-known Ethereum foundation address
export const EXAMPLE_CLEAN_ADDRESS = '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';

// ═══════════════════════════════════════════════════════════════════════════
// INDEXER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Ponder indexer URL
// In production, this should point to the deployed indexer
// For development, it defaults to localhost
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? 'http://localhost:42069';

// Hub chain ID for explorer links
// Base mainnet (8453) for production, Base Sepolia (84532) for staging
export const HUB_CHAIN_ID = process.env.NODE_ENV === 'production' ? 8453 : 84532;
