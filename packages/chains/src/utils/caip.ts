/**
 * CAIP-2 and CAIP-10 utilities for multi-chain address handling.
 *
 * CAIP-2: Chain identifiers (e.g., "eip155:8453" for Base)
 * CAIP-10: Account identifiers (e.g., "eip155:8453:0x123...abc")
 *
 * On-chain, chain IDs are stored as keccak256 hashes of CAIP-2 strings
 * for gas efficiency. This lookup table resolves hashes to readable strings.
 */

import { keccak256, encodePacked } from 'viem';
import { anvilHub, anvilSpoke, base, baseSepolia, optimism, optimismSepolia } from '../networks';

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-2 LOOKUP TABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-computed CAIP-2 hashes for supported chains.
 * Maps keccak256(abi.encodePacked("eip155:CHAIN_ID")) → "eip155:CHAIN_ID"
 *
 * To add a new chain:
 * 1. Compute hash: computeCAIP2Hash('eip155:NEW_CHAIN_ID')
 * 2. Add entry to this table
 *
 * IMPORTANT: Update this table BEFORE deploying contracts to new chains
 */
export const CAIP2_LOOKUP: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════
  // LOCAL DEVELOPMENT
  // Hashes computed via: keccak256(encodePacked(['string'], ['eip155:CHAIN_ID']))
  // ═══════════════════════════════════════════════════════════════
  // Anvil Hub (chainId 31337)
  '0x318e51c37247d03bad135571413b06a083591bcc680967d80bf587ac928cf369': `eip155:${anvilHub.chainId}`,
  // Anvil Spoke (chainId 31338)
  '0x6fb84c7948e7a13a872038b4362f7a1ede72e8075ef49d57592e1888652b0443': `eip155:${anvilSpoke.chainId}`,

  // ═══════════════════════════════════════════════════════════════
  // TESTNETS
  // ═══════════════════════════════════════════════════════════════
  // Base Sepolia (hub testnet)
  '0x8a9a9c58b754a98f1ff302a7ead652cfd23eb36a5791767b5d185067dd9481c2': `eip155:${baseSepolia.chainId}`,
  // Optimism Sepolia (spoke testnet)
  '0xed0d19ae6067b72db99bcb0dc8751b7d9a0733d390cef703366aa5c2ab3cc467': `eip155:${optimismSepolia.chainId}`,

  // ═══════════════════════════════════════════════════════════════
  // MAINNETS
  // ═══════════════════════════════════════════════════════════════
  // Ethereum Mainnet
  '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6': 'eip155:1',
  // Base
  '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec': `eip155:${base.chainId}`,
  // Optimism
  '0x83153bb1dd0a48bb74b01b90ac672ee6185cc64877b9c948eec5e4e5f11585f0': `eip155:${optimism.chainId}`,
  // Arbitrum One
  '0x1fca116f439fa7af0604ced8c7a6239cdcabb5070838cbc80cdba0089733e472': 'eip155:42161',
  // Polygon
  '0x5fe63a02668caaabe84ca512d75c3f07cc1feebf41438c74a4968608b451809e': 'eip155:137',

  // ═══════════════════════════════════════════════════════════════
  // FUTURE: NON-EVM CHAINS
  // ═══════════════════════════════════════════════════════════════
  // Solana Mainnet: 'solana:mainnet'
  // Solana Devnet: 'solana:devnet'
  // Bitcoin: 'bip122:000000000019d6689c085ae165831e93'
};

/**
 * Map Hyperlane domain IDs to CAIP-2 strings.
 * Hyperlane uses its own domain IDs which may differ from chain IDs.
 */
export const HYPERLANE_DOMAIN_TO_CAIP2: Record<number, string> = {
  1: 'eip155:1', // Ethereum
  [optimism.chainId]: `eip155:${optimism.chainId}`,
  137: 'eip155:137', // Polygon
  [base.chainId]: `eip155:${base.chainId}`,
  42161: 'eip155:42161', // Arbitrum
  [baseSepolia.chainId]: `eip155:${baseSepolia.chainId}`,
  [optimismSepolia.chainId]: `eip155:${optimismSepolia.chainId}`,
  [anvilHub.chainId]: `eip155:${anvilHub.chainId}`,
  [anvilSpoke.chainId]: `eip155:${anvilSpoke.chainId}`,
};

/**
 * Human-readable chain names for display.
 */
export const CAIP2_CHAIN_NAMES: Record<string, string> = {
  'eip155:1': 'Ethereum',
  [`eip155:${base.chainId}`]: 'Base',
  [`eip155:${baseSepolia.chainId}`]: 'Base Sepolia',
  [`eip155:${optimism.chainId}`]: 'Optimism',
  [`eip155:${optimismSepolia.chainId}`]: 'Optimism Sepolia',
  'eip155:42161': 'Arbitrum One',
  'eip155:137': 'Polygon',
  [`eip155:${anvilHub.chainId}`]: 'Anvil Hub',
  [`eip155:${anvilSpoke.chainId}`]: 'Anvil Spoke',
  'solana:mainnet': 'Solana',
  'solana:devnet': 'Solana Devnet',
};

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-2 FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a bytes32 chain ID hash to CAIP-2 string.
 * @param chainIdHash - The keccak256 hash of the CAIP-2 string
 * @returns CAIP-2 string (e.g., "eip155:8453") or null if unknown
 */
export function resolveChainIdHash(chainIdHash: string): string | null {
  return CAIP2_LOOKUP[chainIdHash.toLowerCase()] ?? null;
}

/**
 * Get numeric chain ID from CAIP-2 string (EVM only).
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns Numeric chain ID or null for non-EVM chains
 */
export function caip2ToNumericChainId(caip2: string): number | null {
  if (!caip2.startsWith('eip155:')) return null;
  const chainId = parseInt(caip2.split(':')[1], 10);
  return isNaN(chainId) ? null : chainId;
}

/**
 * Build CAIP-2 string from numeric chain ID.
 * @param chainId - Numeric chain ID
 * @returns CAIP-2 string (e.g., "eip155:8453")
 */
export function toCAIP2(chainId: number): string {
  return `eip155:${chainId}`;
}

/**
 * Convert Hyperlane domain ID to CAIP-2 string.
 * @param domain - Hyperlane domain ID
 * @returns CAIP-2 string or null if unknown
 */
export function hyperlaneDomainToCAIP2(domain: number): string | null {
  return HYPERLANE_DOMAIN_TO_CAIP2[domain] ?? null;
}

/**
 * Get human-readable chain name from CAIP-2 string.
 * @param caip2 - CAIP-2 string
 * @returns Human-readable name or the CAIP-2 string if not found
 */
export function getCAIP2ChainName(caip2: string): string {
  return CAIP2_CHAIN_NAMES[caip2] ?? caip2;
}

/**
 * Compute CAIP-2 hash for a given chain (utility for adding new chains).
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns bytes32 hash
 */
export function computeCAIP2Hash(caip2: string): string {
  return keccak256(encodePacked(['string'], [caip2]));
}

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-10 FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build CAIP-10 address from wallet address and numeric chain ID.
 * @param address - Wallet address (will be lowercased)
 * @param chainId - Numeric chain ID
 * @returns CAIP-10 string (e.g., "eip155:8453:0x123...abc")
 */
export function toCAIP10(address: string, chainId: number): string {
  return `eip155:${chainId}:${address.toLowerCase()}`;
}

/**
 * Build CAIP-10 address from wallet address and CAIP-2 chain string.
 * @param address - Wallet address (will be lowercased)
 * @param caip2 - CAIP-2 chain string
 * @returns CAIP-10 string
 */
export function toCAIP10FromCAIP2(address: string, caip2: string): string {
  return `${caip2}:${address.toLowerCase()}`;
}

/**
 * Parse a CAIP-10 string into its components.
 * @param caip10 - CAIP-10 string (e.g., "eip155:8453:0x123...abc")
 * @returns Parsed components or null if invalid
 */
export function parseCAIP10(
  caip10: string
): { namespace: string; chainId: string; address: string } | null {
  const parts = caip10.split(':');
  if (parts.length !== 3) return null;
  return {
    namespace: parts[0],
    chainId: parts[1],
    address: parts[2],
  };
}

/**
 * Extract the wallet address from a CAIP-10 string.
 * @param caip10 - CAIP-10 string
 * @returns Wallet address or null if invalid
 */
export function extractAddressFromCAIP10(caip10: string): string | null {
  const parsed = parseCAIP10(caip10);
  return parsed?.address ?? null;
}

/**
 * Extract the CAIP-2 chain identifier from a CAIP-10 string.
 * @param caip10 - CAIP-10 string
 * @returns CAIP-2 string or null if invalid
 */
export function extractCAIP2FromCAIP10(caip10: string): string | null {
  const parsed = parseCAIP10(caip10);
  if (!parsed) return null;
  return `${parsed.namespace}:${parsed.chainId}`;
}
