/**
 * ENS name detection and validation utilities.
 */

import { detectSearchType } from '@swr/search';
import { normalize } from 'viem/ens';

/**
 * Whether a resolved ENS name is safe to display in place of an address.
 *
 * A resolved name is attacker-controlled data: anyone can register a name, point it at their
 * own wallet, and set the reverse record. When the UI substitutes that name for the hex
 * address in a slot where someone decides whom to trust, the attacker chooses what that slot
 * says.
 *
 * Three rejections, each closing a distinct vector:
 *
 * 1. **Names that are not their own normalized form.** ENSIP-15 normalization is what makes
 *    two names that look identical resolve identically. A name that survives resolution but
 *    differs from `normalize(name)` is displaying something other than what it is.
 * 2. **Names shaped like hex addresses.** `0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth`
 *    is pure ASCII, fully ENSIP-15-valid, registerable today, and unchanged by `normalize`.
 *    In an address slot it reads as a hex address while resolving to the attacker's wallet.
 *    This is why the normalization gate alone is insufficient.
 * 3. **Names carrying bidirectional control characters.** RLO and friends reorder the text
 *    around them, so a name can rewrite the sentence it sits in. Rendering isolates them too
 *    (belt and braces), but they have no legitimate use in a name we display.
 *
 * @param name - The resolved ENS name, or null/undefined when none resolved
 * @returns true only if the name can be shown in place of an address
 */
export function isDisplaySafeEnsName(name: string | null | undefined): name is string {
  if (!name || typeof name !== 'string') return false;

  // Anything that looks like the start of a hex address. Six nibbles is already enough to
  // impersonate a truncated address, and truncated is how addresses are usually shown.
  //
  // The rule is applied to the name with `-`, `_` and `.` REMOVED, not to the raw string.
  // Hyphens are ENS-legal, so `0x-d8da6bf269c7bb.eth` and `0x-d8da-6bf2-69c7.eth` are
  // registerable names that carry no bidi controls and are their own normalized form — yet
  // they read as an address in an address slot. Stripping separators first collapses every
  // such spacing variant onto the same test.
  //
  // Deliberately narrow: the check only fires when the name STARTS with `0x`, so ordinary
  // names that merely contain hex letters are untouched. `0xproject.eth` survives because
  // `0xproject` is not six-plus hex nibbles.
  //
  // It is not free of false positives, and that is the accepted side of the trade: separators
  // are stripped before the test and the `.eth` label is part of the string, so a plausible
  // name like `0xdecaf.eth` collapses to `0xdecafeth` and its first six nibbles (d,e,c,a,f,e)
  // read as hex. Such a name falls back to displaying its hex address, which is a cosmetic
  // loss; letting a truncated-address impersonation through is not. See the test that pins
  // this case.
  const withoutSeparators = name.replace(/[-_.]/g, '');
  if (/^0x[0-9a-fA-F]{6,}/.test(withoutSeparators)) return false;

  // Second shape: a name that begins with `0x` and is overwhelmingly hex characters after it,
  // e.g. `0xd8da6bf2z69c7bb.eth`, where a single non-hex letter is enough to break the
  // consecutive-nibble run above while the string still reads as an address at a glance.
  // Threshold is 80% of a body that is itself at least six characters long — short names like
  // `0xdao` cannot trip it.
  if (/^0x/i.test(withoutSeparators)) {
    const body = withoutSeparators.slice(2).replace(/eth$/i, '');
    const hexChars = body.replace(/[^0-9a-fA-F]/g, '').length;
    if (body.length >= 6 && hexChars / body.length >= 0.8) return false;
  }

  // Bidi embedding/override (U+202A-U+202E), isolates (U+2066-U+2069) and the LRM/RLM marks.
  // Written as escapes deliberately - as literals they would be invisible in this source.
  if (/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/.test(name)) return false;

  try {
    return normalize(name) === name;
  } catch {
    // Not a normalizable name at all.
    return false;
  }
}

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
