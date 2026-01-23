/**
 * CAIP-2 and CAIP-10 chain identifier utilities.
 *
 * CAIP-2: Chain Identifier (e.g., "eip155:8453" for Base)
 * CAIP-10: Account Identifier (e.g., "eip155:8453:0x123...")
 *
 * On-chain, we store CAIP-2 identifiers as bytes32 hashes:
 *   bytes32 chainId = keccak256(bytes("eip155:8453"))
 *
 * All functions are re-exported from @swr/chains to ensure
 * consistency with CLI and match Solidity CAIP2.fromEIP155().
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

// Re-export everything from @swr/chains for convenience
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
  bytes32ToCAIP2,
  // Chain name utilities
  getChainName,
  getCAIP2ChainName,
  // Lookup tables
  CAIP2_LOOKUP,
  CAIP2_CHAIN_NAMES,
} from '@swr/chains';

import type { Hex } from 'viem';
import { chainIdToBytes32 } from '@swr/chains';

/**
 * Convert an EIP-155 chain ID number to a CAIP-2 string.
 * @param chainId - EIP-155 chain ID (e.g., 8453 for Base)
 * @returns CAIP-2 string (e.g., "eip155:8453")
 * @deprecated Use toCAIP2 from @swr/chains instead
 */
export function chainIdToCAIP2String(chainId: number): string {
  return `eip155:${chainId}`;
}

/**
 * Convert an EIP-155 chain ID number to a CAIP-2 bytes32 hash.
 * This matches the on-chain format: keccak256(bytes("eip155:8453"))
 *
 * @param chainId - EIP-155 chain ID (e.g., 8453 for Base)
 * @returns CAIP-2 identifier as bytes32 hash
 */
export function chainIdToCAIP2(chainId: number): Hex {
  return chainIdToBytes32(chainId);
}
