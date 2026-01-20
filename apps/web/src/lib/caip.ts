/**
 * CAIP-2 and CAIP-10 chain identifier utilities.
 *
 * CAIP-2: Chain Identifier (e.g., "eip155:8453" for Base)
 * CAIP-10: Account Identifier (e.g., "eip155:8453:0x123...")
 *
 * On-chain, we store CAIP-2 identifiers as bytes32 hashes:
 *   bytes32 chainId = keccak256(bytes("eip155:8453"))
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

import { keccak256, encodePacked, type Hex } from 'viem';
import { toCAIP2, getChainName, getCAIP2ChainName } from '@swr/chains';

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-2: Chain Identifiers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert an EIP-155 chain ID number to a CAIP-2 string.
 * @param chainId - EIP-155 chain ID (e.g., 8453 for Base)
 * @returns CAIP-2 string (e.g., "eip155:8453")
 */
export function chainIdToCAIP2String(chainId: number): string {
  return toCAIP2(chainId);
}

/**
 * Convert an EIP-155 chain ID number to a CAIP-2 bytes32 hash.
 * This matches the on-chain format: keccak256(bytes("eip155:8453"))
 *
 * @param chainId - EIP-155 chain ID (e.g., 8453 for Base)
 * @returns CAIP-2 identifier as bytes32 hash
 */
export function chainIdToCAIP2(chainId: number): Hex {
  const caip2String = toCAIP2(chainId);
  return keccak256(encodePacked(['string'], [caip2String]));
}

// ═══════════════════════════════════════════════════════════════════════════
// Merkle Tree Leaf Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute a Merkle tree leaf for a transaction.
 * Matches on-chain format: keccak256(abi.encodePacked(txHash, chainId))
 *
 * @param txHash - Transaction hash
 * @param chainId - CAIP-2 chain identifier as bytes32
 * @returns Merkle leaf hash
 */
export function computeTransactionLeaf(txHash: Hex, chainId: Hex): Hex {
  return keccak256(encodePacked(['bytes32', 'bytes32'], [txHash, chainId]));
}

/**
 * Compute a Merkle tree leaf from transaction hash and numeric chain ID.
 * Convenience function that converts chain ID to CAIP-2 bytes32 first.
 *
 * @param txHash - Transaction hash
 * @param chainId - EIP-155 chain ID number
 * @returns Merkle leaf hash
 */
export function computeTransactionLeafFromChainId(txHash: Hex, chainId: number): Hex {
  const caip2Hash = chainIdToCAIP2(chainId);
  return computeTransactionLeaf(txHash, caip2Hash);
}

// ═══════════════════════════════════════════════════════════════════════════
// Chain Name Utilities
// ═══════════════════════════════════════════════════════════════════════════

export { getChainName, getCAIP2ChainName };
