/**
 * CAIP utilities for the CLI.
 *
 * Uses @swr/chains for CAIP-2 parsing and chain names.
 * Provides contract-specific bytes32 conversions.
 */

import { type Hex, pad, toHex } from 'viem';
import { toCAIP2, caip2ToNumericChainId, getCAIP2ChainName } from '@swr/chains';

// Re-export from @swr/chains for convenience
export { toCAIP2, caip2ToNumericChainId, getCAIP2ChainName };

// ═══════════════════════════════════════════════════════════════════════════
// BYTES32 CONVERSIONS (Contract-specific)
// ═══════════════════════════════════════════════════════════════════════════

// Note: Our contracts store chainIds as padded bytes32 values (not CAIP-2 hashes).
// Example: chainId 8453 → bytes32(uint256(8453)) → 0x0000...2105

/**
 * Convert numeric chain ID to bytes32 for contract calls.
 * This matches how Solidity stores chain IDs: bytes32(uint256(chainId))
 */
export function chainIdToBytes32(chainId: bigint | number): Hex {
  return pad(toHex(BigInt(chainId)), { size: 32 });
}

/**
 * Parse CAIP-2 string to bytes32 for contract calls.
 * @example "eip155:8453" → 0x0000...2105 (8453 padded to bytes32)
 */
export function caip2ToBytes32(caip2: string): Hex {
  const chainId = caip2ToNumericChainId(caip2);
  if (chainId === null) {
    throw new Error(`Unsupported or invalid CAIP-2 format: ${caip2}`);
  }
  return chainIdToBytes32(chainId);
}

/**
 * Convert bytes32 back to CAIP-2 string.
 * @throws If chainId exceeds Number.MAX_SAFE_INTEGER
 */
export function bytes32ToCaip2(bytes32: Hex): string {
  const chainId = BigInt(bytes32);
  if (chainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Chain ID ${chainId} exceeds safe integer range`);
  }
  return toCAIP2(Number(chainId));
}

/**
 * Get display name for a chain from its numeric ID.
 * @throws If chainId exceeds Number.MAX_SAFE_INTEGER
 */
export function getChainName(chainId: bigint | number): string {
  const numericId = typeof chainId === 'bigint' ? chainId : BigInt(chainId);
  if (numericId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Chain ID ${numericId} exceeds safe integer range`);
  }
  const caip2 = toCAIP2(Number(numericId));
  return getCAIP2ChainName(caip2);
}

// Common chain IDs (re-exported for backwards compatibility)
export const CHAIN_IDS = {
  ETHEREUM: 1n,
  OPTIMISM: 10n,
  BASE: 8453n,
  ARBITRUM: 42161n,
  POLYGON: 137n,
  SEPOLIA: 11155111n,
  BASE_SEPOLIA: 84532n,
  OPTIMISM_SEPOLIA: 11155420n,
  ANVIL: 31337n,
} as const;
