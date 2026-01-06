/**
 * Example addresses for the search preview demo.
 */

// Placeholder - will show "not found" until we register a demo wallet
// Using the dead address as a known example
export const EXAMPLE_REGISTERED_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// Any valid address not in registry - using a well-known Ethereum foundation address
export const EXAMPLE_CLEAN_ADDRESS = '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';

// Chain ID for queries (Base Sepolia for staging/dev, Base mainnet for production)
export const REGISTRY_CHAIN_ID = process.env.NODE_ENV === 'production' ? 8453 : 84532;

// Contract address - should come from environment
export const REGISTRY_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // Default localhost address
