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
 *
 * detectSearchType('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:FN1abc…')
 * // => 'unsupported' — a real identifier this registry cannot answer for. NOT 'invalid'.
 * ```
 */
export function detectSearchType(input: string): SearchType {
  const trimmed = input.trim();

  if (!trimmed) return 'invalid';

  // CAIP-10 format: <namespace>:<chainId>:<address>
  if (trimmed.includes(':')) {
    // Supported today: eip155 with a valid EVM address (numeric or wildcard chain ref).
    if (isCAIP10(trimmed)) {
      return 'caip10';
    }

    // Not supported, and the distinction below is the whole point (finding S-2).
    //
    // For eip155 we can adjudicate: we know exactly what an EVM address looks like, so
    // `eip155:8453:0xnope` is a malformed identifier — a typo, genuinely 'invalid'. There is
    // no registry entry it could be missing.
    //
    // For any other namespace we cannot. `solana:mainnet:FN1abc…` is a perfectly well-formed
    // account identifier; we simply have no way to look it up (see searchWalletByCAIP10).
    // Calling that 'invalid' routes it to a `found: false` result, and `if (!found) allow()`
    // then clears an address the registry never checked. It must reach the throwing path.
    if (isCAIP10Shaped(trimmed) && !isEvmNamespace(trimmed)) {
      return 'unsupported';
    }

    return 'invalid';
  }

  const lower = trimmed.toLowerCase();

  // Address: 0x + 40 hex chars = 42 chars
  // Will search BOTH stolen wallet registry AND fraudulent contract registry
  if (/^0x[0-9a-f]{40}$/.test(lower)) {
    return 'address';
  }

  // Transaction hash: 0x + 64 hex chars = 66 chars
  if (/^0x[0-9a-f]{64}$/.test(lower)) {
    return 'transaction';
  }

  return 'invalid';
}

/**
 * CAIP-10 grammar, namespace-agnostic.
 *
 * From CAIP-2 / CAIP-10: `namespace` is `[-a-z0-9]{3,8}`, `reference` is `[-_a-zA-Z0-9]{1,32}`,
 * `account_address` is `[-.%a-zA-Z0-9]{1,128}`. Deliberately does NOT constrain the namespace
 * to one this package supports — telling "an identifier we can't answer for" apart from "not
 * an identifier" is exactly what it is for.
 */
const CAIP10_SHAPE = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:[-.%a-zA-Z0-9]{1,128}$/;

/**
 * Whether a string is a well-formed CAIP-10 account identifier in ANY namespace.
 *
 * Case is preserved on the reference and address: Solana base58 and Bitcoin base58check are
 * case-sensitive, and lowercasing them produces a different (invalid) identifier.
 */
export function isCAIP10Shaped(value: string): boolean {
  const trimmed = value.trim();
  const firstColon = trimmed.indexOf(':');
  if (firstColon <= 0) return false;
  // Only the namespace is case-normalized; CAIP-2 defines it as lowercase.
  const normalized = trimmed.slice(0, firstColon).toLowerCase() + trimmed.slice(firstColon);
  return CAIP10_SHAPE.test(normalized);
}

/** Whether an identifier's namespace is `eip155`, whatever else is wrong with it. */
function isEvmNamespace(value: string): boolean {
  const firstColon = value.indexOf(':');
  if (firstColon <= 0) return false;
  return value.slice(0, firstColon).toLowerCase() === 'eip155';
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
 *
 * The chain reference may be a wildcard. A wallet marked stolen is stolen on every EVM
 * chain, so the registry stores eip155 wallets under a wildcard key (`CAIP10.walletKey`)
 * and surfaces it to users in two dialects: the contracts and landing page render `_`
 * (`CAIP10Evm.sol`, `toCAIP10Wildcard`) while the indexer and dashboard render `*`.
 * Rejecting either meant a user who copied the identifier the app had just shown them
 * got "invalid input", so both are accepted.
 */
export function isCAIP10(value: string): boolean {
  const parts = value.toLowerCase().split(':');
  if (parts.length !== 3) return false;
  const [namespace, chainId, address] = parts;
  return (
    namespace === 'eip155' &&
    chainId !== undefined &&
    address !== undefined &&
    (/^\d+$/.test(chainId) || EVM_WILDCARD_CHAIN_REFS.includes(chainId)) &&
    /^0x[0-9a-f]{40}$/.test(address)
  );
}

/**
 * Chain reference used by eip155 wallet keys, which are chain-agnostic.
 * This is the indexer/dashboard dialect; see {@link EVM_WILDCARD_CHAIN_REFS}.
 */
export const EVM_WILDCARD_CHAIN_REF = '*';

/**
 * Both wildcard dialects in the wild: `*` (indexer storage + dashboard display) and
 * `_` (contract storage keys via `CAIP10Evm.sol` and the landing page display).
 */
export const EVM_WILDCARD_CHAIN_REFS: readonly string[] = [EVM_WILDCARD_CHAIN_REF, '_'];

/**
 * Parse an eip155 CAIP-10 whose chain reference is a wildcard (`*` or `_`).
 *
 * Kept separate from {@link parseCAIP10} because that returns a numeric chainId and a
 * wildcard has no numeric form.
 *
 * @returns The address, or null if this is not a wildcard eip155 identifier
 */
export function parseWildcardCAIP10(value: string): { address: string } | null {
  const parts = value.trim().split(':');
  if (parts.length !== 3) return null;
  const [namespace, chainId, address] = parts;
  if (namespace?.toLowerCase() !== 'eip155') return null;
  if (chainId === undefined || !EVM_WILDCARD_CHAIN_REFS.includes(chainId)) return null;
  if (!address || !isAddress(address)) return null;
  return { address };
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
