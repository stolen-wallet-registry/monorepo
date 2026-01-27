/**
 * ENS name detection and validation utilities.
 */

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
 * @param query - Search query to classify
 * @returns Query type: 'address' | 'transaction' | 'ens' | 'caip10' | 'invalid'
 */
export function detectSearchTypeWithEns(query: string): SearchTypeWithEns {
  if (!query || typeof query !== 'string') return 'invalid';

  const trimmed = query.trim();

  // Check for ENS name first (before hex checks)
  if (isEnsName(trimmed)) {
    return 'ens';
  }

  const lowered = trimmed.toLowerCase();

  // Check for CAIP-10 format (eip155:chainId:address)
  if (lowered.includes(':')) {
    const parts = lowered.split(':');
    if (
      parts.length === 3 &&
      parts[0] === 'eip155' &&
      /^\d+$/.test(parts[1]) &&
      /^0x[0-9a-f]{40}$/.test(parts[2])
    ) {
      return 'caip10';
    }
  }

  // Check for hex address (42 chars: 0x + 40 hex)
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return 'address';
  }

  // Check for transaction hash (66 chars: 0x + 64 hex)
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return 'transaction';
  }

  return 'invalid';
}
