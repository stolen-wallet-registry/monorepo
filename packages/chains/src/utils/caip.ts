/**
 * CAIP-2 and CAIP-10 utilities for multi-chain address handling.
 *
 * This file re-exports pure CAIP functions from @swr/caip and adds
 * chain-specific lookup tables generated from network configurations.
 *
 * CAIP-2: Chain identifiers (e.g., "eip155:8453" for Base)
 * CAIP-10: Account identifiers (e.g., "eip155:8453:0x123...abc")
 *
 * On-chain, chain IDs are stored as keccak256 hashes of CAIP-2 strings
 * for gas efficiency. The lookup table resolves hashes to readable strings.
 */

import type { Hex } from 'viem';
import { computeCAIP2Hash as computeHash } from '@swr/caip';
import { allNetworks } from '../networks';

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
// LOOKUP TABLES (generated from allNetworks)
// ═══════════════════════════════════════════════════════════════════════════
// All three tables are derived from allNetworks at module init.
// To add a chain: define it in src/networks/ — these tables update automatically.

/**
 * CAIP-2 hash → CAIP-2 string reverse lookup.
 * Maps keccak256(abi.encodePacked("eip155:CHAIN_ID")) → "eip155:CHAIN_ID"
 *
 * Resolved shape:
 * ```
 * {
 *   "0x318e51c3...": "eip155:31337",   // Anvil Hub
 *   "0x6fb84c79...": "eip155:31338",   // Anvil Spoke
 *   "0x1fca116f...": "eip155:42161",   // Arbitrum One
 *   "0x43b48883...": "eip155:8453",    // Base
 *   "0x8a9a9c58...": "eip155:84532",   // Base Sepolia
 *   "0x38b2caf3...": "eip155:1",       // Ethereum
 *   "0x83153bb1...": "eip155:10",      // Optimism
 *   "0xed0d19ae...": "eip155:11155420" // Optimism Sepolia
 * }
 * ```
 */
export const CAIP2_LOOKUP: Record<string, string> = Object.fromEntries(
  allNetworks.map((n) => {
    const caip2 = `eip155:${n.chainId}`;
    return [computeHash(caip2), caip2];
  })
);

/**
 * Hyperlane domain ID → CAIP-2 string.
 * For standard EVM chains, Hyperlane domain IDs equal chain IDs.
 *
 * Resolved shape:
 * ```
 * {
 *   31337: "eip155:31337",   // Anvil Hub
 *   31338: "eip155:31338",   // Anvil Spoke
 *   42161: "eip155:42161",   // Arbitrum One
 *   8453:  "eip155:8453",    // Base
 *   84532: "eip155:84532",   // Base Sepolia
 *   1:     "eip155:1",       // Ethereum
 *   10:    "eip155:10",      // Optimism
 *   11155420: "eip155:11155420" // Optimism Sepolia
 * }
 * ```
 */
export const HYPERLANE_DOMAIN_TO_CAIP2: Record<number, string> = Object.fromEntries(
  allNetworks.map((n) => [n.chainId, `eip155:${n.chainId}`])
);

/**
 * CAIP-2 string → human-readable chain name.
 *
 * Resolved shape:
 * ```
 * {
 *   "eip155:31337":    "Anvil Hub",
 *   "eip155:31338":    "Anvil Spoke",
 *   "eip155:42161":    "Arbitrum One",
 *   "eip155:8453":     "Base",
 *   "eip155:84532":    "Base Sepolia",
 *   "eip155:1":        "Ethereum",
 *   "eip155:10":       "Optimism",
 *   "eip155:11155420": "Optimism Sepolia",
 *   "solana:mainnet":  "Solana",
 *   "solana:devnet":   "Solana Devnet"
 * }
 * ```
 */
export const CAIP2_CHAIN_NAMES: Record<string, string> = Object.fromEntries([
  ...allNetworks.map((n) => [`eip155:${n.chainId}`, n.displayName]),
  // Non-EVM chains (manual until network definitions exist)
  ['solana:mainnet', 'Solana'],
  ['solana:devnet', 'Solana Devnet'],
]);

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP FUNCTIONS
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
