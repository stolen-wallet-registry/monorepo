/**
 * bytes32 conversions for contract interaction.
 *
 * On-chain, CAIP-2 identifiers are stored as keccak256 hashes for gas efficiency:
 *   bytes32 chainId = keccak256(bytes("eip155:8453"))
 *
 * This matches the Solidity CAIP2.fromEIP155() function in contracts.
 */

import { keccak256, encodePacked, type Hex } from 'viem';
import { toCAIP2, caip2ToNumericChainId } from './caip2';

/**
 * Compute CAIP-2 hash for a given chain.
 * This is a utility for adding new chains to lookup tables.
 *
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns bytes32 hash: keccak256(encodePacked("eip155:8453"))
 *
 * @example
 * ```ts
 * computeCAIP2Hash("eip155:8453")
 * // => "0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec"
 * ```
 */
export function computeCAIP2Hash(caip2: string): Hex {
  return keccak256(encodePacked(['string'], [caip2]));
}

/**
 * Convert numeric chain ID to bytes32 for contract interaction.
 * Uses keccak256 hash of CAIP-2 string to match Solidity CAIP2.fromEIP155().
 *
 * @param chainId - EIP-155 chain ID (e.g., 8453 for Base)
 * @returns bytes32 hash: keccak256("eip155:8453")
 *
 * @example
 * ```ts
 * chainIdToBytes32(8453)
 * // => '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec'
 *
 * chainIdToBytes32(1)
 * // => '0x38b2caf37cccf00b6fbc0feb1e534daf567950e4d48066d0e3669028fe5f83e6'
 * ```
 */
export function chainIdToBytes32(chainId: number | bigint): Hex {
  const numericChainId = Number(chainId);
  if (!Number.isSafeInteger(numericChainId) || numericChainId < 0) {
    throw new Error(`Chain ID ${chainId} is invalid or exceeds safe integer range`);
  }
  return computeCAIP2Hash(toCAIP2(numericChainId));
}

/**
 * Convert CAIP-2 string to bytes32 hash for contract interaction.
 *
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns bytes32 hash
 * @throws If CAIP-2 format is invalid or unsupported namespace
 *
 * @example
 * ```ts
 * caip2ToBytes32('eip155:8453')
 * // => '0x43b48883ef7be0f98fe7f98fafb2187e42caab4063697b32816f95e09d69b3ec'
 * ```
 */
export function caip2ToBytes32(caip2: string): Hex {
  // Validate it's a valid EVM CAIP-2 before hashing
  const chainId = caip2ToNumericChainId(caip2);
  if (chainId === null) {
    throw new Error(`Unsupported or invalid CAIP-2 format: ${caip2}`);
  }
  // Hash the validated string directly (equivalent to toCAIP2(chainId))
  return computeCAIP2Hash(caip2);
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 TRUNCATED CHAIN ID HASHES (for Hub contract storage efficiency)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Truncate bytes32 CAIP-2 hash to uint64 for Hub contract storage.
 * Matches Solidity: uint64(uint256(fullHash) >> 192)
 *
 * The Hub contract uses truncated hashes (top 64 bits) for storage efficiency.
 * With ~18 quintillion possible values and only thousands of chains,
 * collision probability is effectively zero.
 *
 * @param fullHash - Full bytes32 CAIP-2 hash
 * @returns Truncated uint64 as bigint
 *
 * @example
 * ```ts
 * const fullHash = chainIdToBytes32(8453);
 * truncateChainIdHash(fullHash);
 * // => 4843947148038746616n (top 64 bits of the hash)
 * ```
 */
export function truncateChainIdHash(fullHash: Hex): bigint {
  const hashBigInt = BigInt(fullHash);
  return hashBigInt >> 192n;
}

/**
 * Get truncated chain ID hash directly from numeric chain ID.
 * Convenience function for Hub contract calls.
 *
 * @param chainId - Numeric chain ID (e.g., 8453 for Base)
 * @returns Truncated uint64 as bigint
 *
 * @example
 * ```ts
 * getTruncatedChainIdHash(8453);
 * // => 4843947148038746616n
 * ```
 */
export function getTruncatedChainIdHash(chainId: number | bigint): bigint {
  const fullHash = chainIdToBytes32(chainId);
  return truncateChainIdHash(fullHash);
}
