/**
 * Input type detection for registry search.
 */

import { parseCAIP10 as parseCAIP10Base } from '@swr/chains';
import type { SearchType } from './types';

/**
 * Detect the type of search input.
 *
 * @param input - User input string
 * @returns Detected type: 'address' | 'transaction' | 'caip10' | 'invalid'
 *
 * @example
 * ```ts
 * detectSearchType('0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1')
 * // => 'address' (will search both wallet and contract registries)
 *
 * detectSearchType('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
 * // => 'transaction'
 *
 * detectSearchType('eip155:8453:0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1')
 * // => 'caip10'
 * ```
 */
export function detectSearchType(input: string): SearchType {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) return 'invalid';

  // CAIP-10 format: eip155:<chainId>:<address>
  // Must have 3 parts, start with 'eip155', and have valid address
  if (trimmed.includes(':')) {
    if (isCAIP10(trimmed)) {
      return 'caip10';
    }
  }

  // Address: 0x + 40 hex chars = 42 chars
  // Will search BOTH stolen wallet registry AND fraudulent contract registry
  if (trimmed.length === 42 && trimmed.startsWith('0x') && /^0x[0-9a-f]{40}$/.test(trimmed)) {
    return 'address';
  }

  // Transaction hash: 0x + 64 hex chars = 66 chars
  if (trimmed.length === 66 && trimmed.startsWith('0x') && /^0x[0-9a-f]{64}$/.test(trimmed)) {
    return 'transaction';
  }

  return 'invalid';
}

/**
 * Check if a string is a valid Ethereum address.
 */
export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Check if a string is a valid transaction hash.
 */
export function isTransactionHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Check if a string is a valid CAIP-10 identifier.
 */
export function isCAIP10(value: string): boolean {
  const [namespace, chainId, address] = value.toLowerCase().split(':');
  return (
    namespace === 'eip155' &&
    chainId !== undefined &&
    address !== undefined &&
    /^\d+$/.test(chainId) &&
    /^0x[0-9a-f]{40}$/.test(address)
  );
}

/**
 * Parse a CAIP-10 identifier into its components.
 * Preserves original address casing (important for checksum addresses).
 *
 * Returns numeric chainId (unlike @swr/chains which returns string chainId)
 * for convenience in search operations that need numeric chain IDs.
 *
 * Input is trimmed for convenience. Chain ID must be a positive decimal integer.
 *
 * @returns Object with namespace, chainId (number), address, or null if invalid
 */
export function parseCAIP10(
  value: string
): { namespace: string; chainId: number; address: string } | null {
  const parsed = parseCAIP10Base(value.trim());
  if (!parsed) return null;

  // Ensure chainId is a valid decimal integer (no hex, no leading zeros except "0")
  if (!/^\d+$/.test(parsed.chainId)) return null;

  const numericChainId = parseInt(parsed.chainId, 10);
  if (isNaN(numericChainId) || numericChainId < 0) return null;

  return {
    namespace: parsed.namespace,
    chainId: numericChainId,
    address: parsed.address,
  };
}
