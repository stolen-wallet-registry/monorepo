/**
 * CAIP utilities for the CLI.
 *
 * All functions re-exported from @swr/chains for consistency.
 * This ensures CLI produces bytes32 values that match Solidity CAIP2.fromEIP155():
 *   bytes32 chainId = keccak256(bytes("eip155:8453"))
 */

// Re-export all CAIP utilities from @swr/chains
export {
  // bytes32 conversions (matches Solidity CAIP2.fromEIP155)
  chainIdToBytes32,
  caip2ToBytes32,
  bytes32ToCAIP2,
  // String conversions
  toCAIP2,
  caip2ToNumericChainId,
  getCAIP2ChainName,
  computeCAIP2Hash,
  // CAIP-10 functions
  parseCAIP10,
  toCAIP10,
} from '@swr/chains';

// Re-export chain name utility with local alias for backward compat
import { getCAIP2ChainName, toCAIP2 } from '@swr/chains';

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

// Common chain IDs (for backwards compatibility)
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
