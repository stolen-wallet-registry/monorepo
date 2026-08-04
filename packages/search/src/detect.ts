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
 *
 * detectSearchType('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')
 * // => 'unsupported' — the bare form, with no namespace prefix, is what users actually paste.
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

  // A BARE non-EVM address — no namespace prefix (finding S-4).
  //
  // The `isCAIP10Shaped` branch above only catches `solana:<ref>:<addr>`. But a user does not
  // copy that form: a block explorer hands them `FN1abc…` or `bc1q…`, and that is what lands
  // in the search box and in an integrator's API call. Falling through to 'invalid' returns
  // `{ found: false }`, `isCompromised()` reports false, and the obvious
  // `if (!isCompromised(r)) allow()` clears an address no registry ever looked at — the exact
  // harm the 'unsupported' branch was introduced to prevent, reached by the more likely route.
  //
  // These identifiers are recognised by SHAPE, not validated: we do not verify the base58check
  // or bech32 checksum, because the answer either way is the same ("we cannot look this up")
  // and a checksum library is not worth carrying for it. Shape alone is enough to tell a real
  // identifier from a typo, which is the only distinction that changes behaviour here.
  if (isBareNonEvmAddress(trimmed)) {
    return 'unsupported';
  }

  return 'invalid';
}

/**
 * Base58 (Bitcoin/Solana alphabet: no `0`, `O`, `I`, `l`) account identifier, 32–44 chars.
 *
 * That is an ed25519 public key — a Solana account — and it also covers base58 identifiers of
 * similar length in other chains. A 0x-prefixed EVM address can never match: `0` is not in the
 * alphabet, and both EVM forms are returned above anyway.
 */
const BASE58_ACCOUNT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Bitcoin P2PKH (`1…`) and P2SH (`3…`) base58check addresses. */
const BASE58CHECK_BTC = /^[13][1-9A-HJ-NP-Za-km-z]{25,39}$/;

/**
 * bech32 / bech32m: a human-readable prefix, the `1` separator, then the bech32 data charset
 * (which excludes `1`, `b`, `i` and `o`). Covers `bc1…`, `tb1…` and the Cosmos family
 * (`cosmos1…`, `osmo1…`).
 *
 * The data part is required to be at least 20 characters. Real addresses are far longer (a
 * segwit v0 address has 39), and the floor is what stops an ordinary string that happens to
 * contain a `1` from being read as an identifier.
 */
const BECH32_ADDRESS = /^[a-z]{2,12}1[02-9ac-hj-np-z]{20,100}$/;

/**
 * Whether an input with no namespace prefix is nonetheless a recognisable non-EVM address.
 *
 * Deliberately narrow. `'invalid'` must keep meaning invalid: a typo, a half-pasted string or
 * a search for a person's name has no registry entry it could be missing, so returning a
 * negative for it is safe and is what users expect. Only inputs whose shape marks them as a
 * real account identifier in a namespace this registry cannot answer for are widened to
 * 'unsupported'.
 */
function isBareNonEvmAddress(value: string): boolean {
  if (BASE58CHECK_BTC.test(value)) return true;
  if (BASE58_ACCOUNT.test(value)) return true;
  // bech32 is case-insensitive as a whole (mixed case is invalid), so compare in lower case.
  return BECH32_ADDRESS.test(value.toLowerCase());
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
