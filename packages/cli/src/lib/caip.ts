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
  getChainName,
  computeCAIP2Hash,
  // CAIP-10 functions
  parseCAIP10,
  toCAIP10,
  // Chain ID constants
  CHAIN_IDS,
} from '@swr/chains';
