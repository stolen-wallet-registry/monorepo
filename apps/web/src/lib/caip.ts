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

import { keccak256, encodePacked } from 'viem';
import type { Hash, Address } from '@/lib/types/ethereum';

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-2: Chain Identifiers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert an EIP-155 chain ID number to a CAIP-2 string.
 * @param chainId - EIP-155 chain ID (e.g., 8453 for Base)
 * @returns CAIP-2 string (e.g., "eip155:8453")
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
export function chainIdToCAIP2(chainId: number): Hash {
  const caip2String = chainIdToCAIP2String(chainId);
  return keccak256(encodePacked(['string'], [caip2String]));
}

/**
 * Parse a CAIP-2 string to extract the chain ID.
 * Only supports EIP-155 chains for now.
 *
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns Chain ID number or null if invalid/unsupported
 */
export function parseCAIP2String(caip2: string): number | null {
  const match = caip2.match(/^eip155:(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// CAIP-10: Account Identifiers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format an address and chain ID as a CAIP-10 identifier.
 *
 * @param address - Ethereum address
 * @param chainId - EIP-155 chain ID
 * @returns CAIP-10 string (e.g., "eip155:8453:0x123...")
 */
export function toCAIP10(address: Address, chainId: number): string {
  return `eip155:${chainId}:${address.toLowerCase()}`;
}

/**
 * Parse a CAIP-10 identifier to extract address and chain ID.
 * Only supports EIP-155 chains for now.
 *
 * @param caip10 - CAIP-10 string (e.g., "eip155:8453:0x123...")
 * @returns Object with address and chainId, or null if invalid
 */
export function parseCAIP10(caip10: string): { address: Address; chainId: number } | null {
  const match = caip10.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40})$/);
  if (!match) return null;
  return {
    chainId: parseInt(match[1], 10),
    address: match[2] as Address,
  };
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
export function computeTransactionLeaf(txHash: Hash, chainId: Hash): Hash {
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
export function computeTransactionLeafFromChainId(txHash: Hash, chainId: number): Hash {
  const caip2Hash = chainIdToCAIP2(chainId);
  return computeTransactionLeaf(txHash, caip2Hash);
}

// ═══════════════════════════════════════════════════════════════════════════
// Chain Name Utilities
// ═══════════════════════════════════════════════════════════════════════════

// Re-export from @swr/chains for backward compatibility
export { getChainName } from '@swr/chains';
