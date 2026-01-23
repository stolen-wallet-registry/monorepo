/**
 * CAIP-2 Chain Identifier utilities.
 *
 * CAIP-2 defines a way to identify a blockchain in a multi-chain world.
 * Format: `{namespace}:{chainId}`
 *
 * For EVM chains: `eip155:{numeric_chain_id}`
 * For Solana: `solana:{network}` (mainnet, devnet, testnet)
 * For Bitcoin: `bip122:{genesis_hash}` (first 32 hex chars of genesis block hash)
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 */

import type { CAIP2, ParsedCAIP2 } from './types';

/**
 * Build CAIP-2 string from numeric chain ID.
 * Uses EIP-155 namespace for EVM chains.
 *
 * @param chainId - Numeric chain ID (e.g., 8453 for Base)
 * @returns CAIP-2 string (e.g., "eip155:8453")
 * @throws If chainId is not a non-negative integer
 *
 * @example
 * ```ts
 * toCAIP2(8453)   // => "eip155:8453"
 * toCAIP2(1)      // => "eip155:1"
 * toCAIP2(31337)  // => "eip155:31337"
 * ```
 */
export function toCAIP2(chainId: number): CAIP2 {
  if (!Number.isInteger(chainId) || chainId < 0) {
    throw new Error(`Invalid chain ID: ${chainId}`);
  }
  return `eip155:${chainId}`;
}

/**
 * CAIP-2 format regex per specification:
 * - Namespace: [-a-z0-9]{3,8}
 * - ChainId: [-_a-zA-Z0-9]{1,32}
 */
const CAIP2_REGEX = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;

/**
 * Parse a CAIP-2 string into its components.
 *
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns Parsed components or null if invalid
 *
 * @example
 * ```ts
 * parseCAIP2("eip155:8453")
 * // => { namespace: "eip155", chainId: "8453" }
 *
 * parseCAIP2("solana:mainnet")
 * // => { namespace: "solana", chainId: "mainnet" }
 *
 * parseCAIP2("invalid")
 * // => null
 * ```
 */
export function parseCAIP2(caip2: string): ParsedCAIP2 | null {
  if (!CAIP2_REGEX.test(caip2)) return null;
  const parts = caip2.split(':');
  return {
    namespace: parts[0],
    chainId: parts[1],
  };
}

/**
 * Check if a string is a valid CAIP-2 identifier.
 *
 * @param value - String to validate
 * @returns true if valid CAIP-2 format
 */
export function isValidCAIP2(value: string): boolean {
  return parseCAIP2(value) !== null;
}

/**
 * Get numeric chain ID from CAIP-2 string (EVM only).
 *
 * @param caip2 - CAIP-2 string (e.g., "eip155:8453")
 * @returns Numeric chain ID or null for non-EVM chains
 *
 * @example
 * ```ts
 * caip2ToNumericChainId("eip155:8453")  // => 8453
 * caip2ToNumericChainId("eip155:1")     // => 1
 * caip2ToNumericChainId("solana:mainnet") // => null
 * ```
 */
export function caip2ToNumericChainId(caip2: string): number | null {
  if (!caip2.startsWith('eip155:')) return null;
  const chainId = parseInt(caip2.split(':')[1], 10);
  return isNaN(chainId) ? null : chainId;
}
