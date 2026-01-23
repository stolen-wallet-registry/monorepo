/**
 * CAIP-2 and CAIP-10 utilities for multi-chain address handling.
 *
 * This file re-exports pure CAIP functions from @swr/caip and adds
 * chain-specific lookup tables built from network configurations.
 *
 * CAIP-2: Chain identifiers (e.g., "eip155:8453" for Base)
 * CAIP-10: Account identifiers (e.g., "eip155:8453:0x123...abc")
 *
 * On-chain, chain IDs are stored as keccak256 hashes of CAIP-2 strings
 * for gas efficiency. The lookup table resolves hashes to readable strings.
 */

import type { Hex } from 'viem';
import { anvilHub, anvilSpoke, base, baseSepolia, optimism, optimismSepolia } from '../networks';

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS FROM @swr/caip (pure functions)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Types
  type CAIP2,
  type CAIP10,
  type ChainNamespace,
  type ParsedCAIP2,
  type ParsedCAIP10,
  // CAIP-2 functions
  toCAIP2,
  parseCAIP2,
  isValidCAIP2,
  caip2ToNumericChainId,
  // CAIP-10 functions
  toCAIP10,
  toCAIP10FromCAIP2,
  parseCAIP10,
  isValidCAIP10,
  extractAddressFromCAIP10,
  extractCAIP2FromCAIP10,
  // bytes32 conversions
  computeCAIP2Hash,
  chainIdToBytes32,
  caip2ToBytes32,
} from '@swr/caip';

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-2 LOOKUP TABLE (chain-specific, built from network configs)
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
// LOOKUP FUNCTIONS (chain-specific)
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
 * Resolve bytes32 hash back to CAIP-2 string.
 * Uses the pre-computed CAIP2_LOOKUP table for reverse resolution.
 *
 * @param hash - bytes32 CAIP-2 hash
 * @returns CAIP-2 string or null if unknown hash
 *
 * @example
 * ```ts
 * bytes32ToCAIP2('0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec')
 * // => 'eip155:8453'
 * ```
 */
export function bytes32ToCAIP2(hash: Hex): string | null {
  return resolveChainIdHash(hash);
}
