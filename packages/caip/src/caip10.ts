/**
 * CAIP-10 Account Identifier utilities.
 *
 * CAIP-10 defines a way to identify a blockchain account in a multi-chain world.
 * Format: `{namespace}:{chainId}:{address}`
 *
 * Extends CAIP-2 with an account address component.
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

import type { CAIP2, CAIP10, ParsedCAIP10 } from './types';

/**
 * Build CAIP-10 address from wallet address and numeric chain ID.
 * Uses EIP-155 namespace for EVM chains.
 *
 * @param address - Wallet address (will be lowercased)
 * @param chainId - Numeric chain ID
 * @returns CAIP-10 string (e.g., "eip155:8453:0x123...abc")
 *
 * @example
 * ```ts
 * toCAIP10("0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1", 8453)
 * // => "eip155:8453:0x742d35cc6634c0532925a3b844bc454e83c4b3a1"
 * ```
 */
export function toCAIP10(address: string, chainId: number): CAIP10 {
  return `eip155:${chainId}:${address.toLowerCase()}`;
}

/**
 * Build CAIP-10 address from wallet address and CAIP-2 chain string.
 *
 * @param address - Wallet address (will be lowercased)
 * @param caip2 - CAIP-2 chain string
 * @returns CAIP-10 string
 *
 * @example
 * ```ts
 * toCAIP10FromCAIP2("0x123...abc", "eip155:8453")
 * // => "eip155:8453:0x123...abc"
 *
 * toCAIP10FromCAIP2("abc123...", "solana:mainnet")
 * // => "solana:mainnet:abc123..."
 * ```
 */
export function toCAIP10FromCAIP2(address: string, caip2: CAIP2): CAIP10 {
  return `${caip2}:${address.toLowerCase()}`;
}

/**
 * Parse a CAIP-10 string into its components.
 *
 * @param caip10 - CAIP-10 string (e.g., "eip155:8453:0x123...abc")
 * @returns Parsed components or null if invalid
 *
 * @example
 * ```ts
 * parseCAIP10("eip155:8453:0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1")
 * // => { namespace: "eip155", chainId: "8453", address: "0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1" }
 *
 * parseCAIP10("invalid")
 * // => null
 * ```
 */
export function parseCAIP10(caip10: string): ParsedCAIP10 | null {
  const parts = caip10.split(':');
  if (parts.length !== 3) return null;
  return {
    namespace: parts[0],
    chainId: parts[1],
    address: parts[2],
  };
}

/**
 * Check if a string is a valid CAIP-10 identifier.
 *
 * @param value - String to validate
 * @returns true if valid CAIP-10 format
 */
export function isValidCAIP10(value: string): boolean {
  return parseCAIP10(value) !== null;
}

/**
 * Extract the wallet address from a CAIP-10 string.
 *
 * @param caip10 - CAIP-10 string
 * @returns Wallet address or null if invalid
 *
 * @example
 * ```ts
 * extractAddressFromCAIP10("eip155:8453:0x123...abc")
 * // => "0x123...abc"
 * ```
 */
export function extractAddressFromCAIP10(caip10: string): string | null {
  const parsed = parseCAIP10(caip10);
  return parsed?.address ?? null;
}

/**
 * Extract the CAIP-2 chain identifier from a CAIP-10 string.
 *
 * @param caip10 - CAIP-10 string
 * @returns CAIP-2 string or null if invalid
 *
 * @example
 * ```ts
 * extractCAIP2FromCAIP10("eip155:8453:0x123...abc")
 * // => "eip155:8453"
 * ```
 */
export function extractCAIP2FromCAIP10(caip10: string): CAIP2 | null {
  const parsed = parseCAIP10(caip10);
  if (!parsed) return null;
  return `${parsed.namespace}:${parsed.chainId}`;
}
