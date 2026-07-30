/**
 * ENS name detection and validation utilities.
 */

import { detectSearchType } from '@swr/search';

/**
 * Checks if a string looks like an ENS name.
 *
 * Valid ENS names:
 * - End with .eth (e.g., vitalik.eth)
 * - Can be subdomains (e.g., dao.vitalik.eth)
 * - Minimum 3 chars before .eth
 *
 * @param value - String to check
 * @returns true if value appears to be an ENS name
 */
export function isEnsName(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  // Trim and lowercase for comparison
  const normalized = value.trim().toLowerCase();

  // Must end with .eth and have at least 3 chars before
  if (!normalized.endsWith('.eth')) return false;

  const nameWithoutTld = normalized.slice(0, -4);
  if (nameWithoutTld.length < 3) return false;

  // Basic length check only - full validation happens during resolution via normalize()
  return true;
}

/**
 * Extended search type that includes ENS names.
 */
export type SearchTypeWithEns = 'address' | 'transaction' | 'ens' | 'caip10' | 'invalid';

/**
 * Extended search type detection that includes ENS names.
 *
 * Everything except the ENS branch delegates to `detectSearchType`. This used to be a
 * hand-copied duplicate of it, which then drifted: the copy rejected the wildcard CAIP-10
 * (`eip155:*:0x…`) that the registry stores and the UI displays.
 *
 * @param query - Search query to classify
 * @returns Query type: 'address' | 'transaction' | 'ens' | 'caip10' | 'invalid'
 */
export function detectSearchTypeWithEns(query: string): SearchTypeWithEns {
  if (!query || typeof query !== 'string') return 'invalid';

  // ENS is checked first: `detectSearchType` has no notion of it and would return 'invalid'.
  if (isEnsName(query.trim())) {
    return 'ens';
  }

  return detectSearchType(query);
}
