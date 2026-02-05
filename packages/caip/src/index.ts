/**
 * @swr/caip - CAIP-2 and CAIP-10 utilities for multi-chain address handling.
 *
 * CAIP-2: Chain identifiers (e.g., "eip155:8453" for Base)
 * CAIP-10: Account identifiers (e.g., "eip155:8453:0x123...abc")
 *
 * This package provides pure functions for CAIP string manipulation and
 * bytes32 conversions that match the on-chain Solidity CAIP2 library.
 *
 * NOTE: Lookup tables (CAIP2_LOOKUP, CAIP2_CHAIN_NAMES, bytes32ToCAIP2, getCAIP2ChainName)
 * are in @swr/chains because they depend on network configurations.
 *
 * @example
 * ```typescript
 * import {
 *   toCAIP2,
 *   toCAIP10,
 *   parseCAIP10,
 *   chainIdToBytes32,
 * } from '@swr/caip';
 *
 * // Build CAIP identifiers
 * const caip2 = toCAIP2(8453);  // "eip155:8453"
 * const caip10 = toCAIP10(address, 8453);  // "eip155:8453:0x..."
 *
 * // Parse CAIP identifiers
 * const parsed = parseCAIP10("eip155:8453:0x...");
 * // => { namespace: "eip155", chainId: "8453", address: "0x..." }
 *
 * // Convert to bytes32 for contract calls
 * const hash = chainIdToBytes32(8453);
 * // => "0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec"
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type { CAIP2, CAIP10, ChainNamespace, ParsedCAIP2, ParsedCAIP10 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-2 FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export { toCAIP2, parseCAIP2, isValidCAIP2, caip2ToNumericChainId } from './caip2';

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-10 FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export {
  toCAIP10,
  toCAIP10FromCAIP2,
  parseCAIP10,
  isValidCAIP10,
  extractAddressFromCAIP10,
  extractCAIP2FromCAIP10,
  // V2 wildcard support
  toCAIP10Wildcard,
  isWildcardCAIP10,
} from './caip10';

// ═══════════════════════════════════════════════════════════════════════════
// BYTES32 CONVERSIONS
// ═══════════════════════════════════════════════════════════════════════════

export {
  computeCAIP2Hash,
  chainIdToBytes32,
  caip2ToBytes32,
  // V2 truncated hashes for Hub contract
  truncateChainIdHash,
  getTruncatedChainIdHash,
} from './bytes32';
