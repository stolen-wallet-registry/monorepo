import { describe, it, expect } from 'vitest';
import {
  detectSearchType,
  isCAIP10,
  isCAIP10Shaped,
  parseCAIP10,
  parseWildcardCAIP10,
} from './detect';

const ADDRESS = `0x${'a'.repeat(40)}`;
const TX_HASH = `0x${'b'.repeat(64)}`;

describe('isCAIP10', () => {
  it('accepts a numeric chain reference', () => {
    expect(isCAIP10(`eip155:8453:${ADDRESS}`)).toBe(true);
  });

  // The registry stores eip155 wallets under a wildcard key and the UI renders that value
  // verbatim, so a user copying what they were just shown must get a lookup, not "invalid".
  // Both dialects exist: `*` (indexer/dashboard) and `_` (contracts/landing page).
  it('accepts both wildcard chain reference dialects', () => {
    expect(isCAIP10(`eip155:*:${ADDRESS}`)).toBe(true);
    expect(isCAIP10(`eip155:_:${ADDRESS}`)).toBe(true);
  });

  it('rejects a non-eip155 namespace, a bad chain reference, and a bad address', () => {
    expect(isCAIP10(`solana:mainnet:${ADDRESS}`)).toBe(false);
    expect(isCAIP10(`eip155:not-a-chain:${ADDRESS}`)).toBe(false);
    expect(isCAIP10('eip155:8453:0xnope')).toBe(false);
  });

  it('rejects trailing segments beyond namespace:chainId:address', () => {
    expect(isCAIP10(`eip155:8453:${ADDRESS}:junk`)).toBe(false);
  });
});

describe('detectSearchType', () => {
  it('classifies both CAIP-10 forms, addresses, and transaction hashes', () => {
    expect(detectSearchType(`eip155:8453:${ADDRESS}`)).toBe('caip10');
    expect(detectSearchType(`eip155:*:${ADDRESS}`)).toBe('caip10');
    expect(detectSearchType(ADDRESS)).toBe('address');
    expect(detectSearchType(TX_HASH)).toBe('transaction');
    expect(detectSearchType('gibberish')).toBe('invalid');
  });

  // Finding S-2. These two classes must not be merged: 'invalid' routes to a returned
  // `found: false`, and a returned negative for an identifier nothing looked at is how an
  // off-ramp clears a wallet that IS registered stolen. 'unsupported' routes to a throw.
  describe('tells an unanswerable identifier apart from a malformed one', () => {
    it('classifies well-formed non-EVM identifiers as unsupported', () => {
      expect(detectSearchType('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:FN1abcDEFghi')).toBe(
        'unsupported'
      );
      expect(
        detectSearchType(
          'bip122:000000000019d6689c085ae165831e93:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
        )
      ).toBe('unsupported');
      expect(
        detectSearchType('cosmos:cosmoshub-4:cosmos1t2uflqwqe0fsj0shcfkrvpukewcw40yjj6hdc0')
      ).toBe('unsupported');
    });

    it('keeps a malformed EVM identifier as invalid', () => {
      // The namespace is one we can adjudicate: we know what an EVM address looks like, so
      // this is a typo with no registry entry to miss. Calling it 'unsupported' would show a
      // "could not verify" warning for a mistyped address and blunt the real ones.
      expect(detectSearchType('eip155:8453:0xnope')).toBe('invalid');
      expect(detectSearchType(`eip155:not-a-chain:${ADDRESS}`)).toBe('invalid');
      expect(detectSearchType(`eip155:8453:${ADDRESS}:junk`)).toBe('invalid');
    });

    it('keeps things that are not identifiers at all as invalid', () => {
      expect(detectSearchType('hello:world')).toBe('invalid');
      expect(detectSearchType('http://example.com/x')).toBe('invalid');
      expect(detectSearchType('a:b:c')).toBe('invalid'); // namespace under 3 chars
      expect(detectSearchType('')).toBe('invalid');
    });
  });

  // Finding S-4, the same fail-open reached by the likelier route. A block explorer hands the
  // user `bc1q…` or `FN1abc…`, never `bip122:<genesis>:bc1q…`, so the bare form is what lands
  // in the search box. 'invalid' would return `{ found: false }` and clear an address nothing
  // looked at; these must reach the throwing path.
  describe('recognises a bare non-EVM address with no namespace prefix', () => {
    it('classifies bech32 addresses as unsupported', () => {
      // Bitcoin segwit (mainnet + testnet) and the Cosmos family.
      expect(detectSearchType('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('unsupported');
      expect(detectSearchType('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe('unsupported');
      expect(detectSearchType('cosmos1t2uflqwqe0fsj0shcfkrvpukewcw40yjj6hdc0')).toBe('unsupported');
    });

    it('classifies base58check Bitcoin addresses as unsupported', () => {
      expect(detectSearchType('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('unsupported'); // P2PKH
      expect(detectSearchType('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('unsupported'); // P2SH
    });

    it('classifies a base58 Solana account as unsupported', () => {
      expect(detectSearchType('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toBe('unsupported');
      expect(detectSearchType('So11111111111111111111111111111111111111112')).toBe('unsupported');
    });

    it('is not defeated by surrounding whitespace', () => {
      expect(detectSearchType('  1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa  ')).toBe('unsupported');
    });

    // The other half of the line. Widening 'unsupported' too far would show "could not
    // verify" for every typo, which trains users to ignore it — and 'invalid' is a SAFE
    // negative precisely because a typo has no registry entry it could be missing.
    it('leaves ordinary non-identifier input as invalid', () => {
      expect(detectSearchType('gibberish')).toBe('invalid');
      expect(detectSearchType('vitalik.eth')).toBe('invalid');
      expect(detectSearchType('Coinbase')).toBe('invalid');
      expect(detectSearchType('some random search phrase')).toBe('invalid');
      // Too short to be an account identifier in any of the shapes above.
      expect(detectSearchType('1A1zP1eP5QGef')).toBe('invalid');
      // Contains `0`, `O`, `I` and `l`, none of which are in the base58 alphabet.
      expect(detectSearchType('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl')).toBe('invalid');
      // A `1` in a word does not make it bech32 — the data part is far too short and uses
      // characters the bech32 charset excludes.
      expect(detectSearchType('version1release')).toBe('invalid');
    });

    // A truncated EVM address must not become 'unsupported': it is 0x-prefixed, `0` is not in
    // the base58 alphabet, and a mistyped address should stay a safe negative.
    it('leaves a malformed EVM address as invalid', () => {
      expect(detectSearchType('0x742D35CC6634c0532925A3b844BC9E7595F0BE')).toBe('invalid');
      expect(detectSearchType('0xnope')).toBe('invalid');
    });
  });

  // Solana base58 and Bitcoin base58check are case-sensitive; classification must not depend
  // on having destroyed the casing first.
  it('does not depend on lowercasing a case-sensitive identifier', () => {
    const mixed = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:FN1abcDEFghi';
    expect(detectSearchType(mixed)).toBe(detectSearchType(mixed.toLowerCase()));
  });

  it('accepts a checksummed EVM address regardless of casing', () => {
    const checksummed = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';
    expect(detectSearchType(checksummed)).toBe('address');
    expect(detectSearchType(`eip155:8453:${checksummed}`)).toBe('caip10');
  });
});

describe('isCAIP10Shaped', () => {
  // Namespace-agnostic on purpose: it is the test for "this is a real identifier", separate
  // from "this is one we support".
  it('accepts any namespace matching the CAIP-10 grammar', () => {
    expect(isCAIP10Shaped(`eip155:8453:${ADDRESS}`)).toBe(true);
    expect(isCAIP10Shaped('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:FN1abc')).toBe(true);
    expect(isCAIP10Shaped('bip122:000000000019d6689c085ae165831e93:1A1zP1eP')).toBe(true);
  });

  it('rejects strings that are not three-part identifiers', () => {
    expect(isCAIP10Shaped(ADDRESS)).toBe(false);
    expect(isCAIP10Shaped('solana:mainnet')).toBe(false);
    expect(isCAIP10Shaped('solana:mainnet:abc:extra')).toBe(false);
    expect(isCAIP10Shaped('ab:mainnet:abc')).toBe(false); // namespace too short
    expect(isCAIP10Shaped(':mainnet:abc')).toBe(false);
  });
});

describe('parseWildcardCAIP10', () => {
  it('extracts the address from a wildcard identifier, preserving casing', () => {
    const mixedCase = '0xAbC0000000000000000000000000000000000123';
    expect(parseWildcardCAIP10(`eip155:*:${mixedCase}`)).toEqual({ address: mixedCase });
  });

  // The landing page displays the contract dialect (`eip155:_:0x…`, from CAIP10Evm.sol /
  // toCAIP10Wildcard) and feeds its search box through this same package.
  it('accepts the underscore wildcard dialect the contracts and landing page use', () => {
    expect(parseWildcardCAIP10(`eip155:_:${ADDRESS}`)).toEqual({ address: ADDRESS });
    expect(detectSearchType(`eip155:_:${ADDRESS}`)).toBe('caip10');
  });

  it('returns null for numeric chain references and malformed input', () => {
    expect(parseWildcardCAIP10(`eip155:8453:${ADDRESS}`)).toBeNull();
    expect(parseWildcardCAIP10(`eip155:*:0xnope`)).toBeNull();
    expect(parseWildcardCAIP10(ADDRESS)).toBeNull();
  });
});

describe('parseCAIP10', () => {
  // parseCAIP10 returns a numeric chainId, which a wildcard has no form for — callers that
  // need the wildcard use parseWildcardCAIP10 instead.
  it('returns null for the wildcard rather than coercing it', () => {
    expect(parseCAIP10(`eip155:*:${ADDRESS}`)).toBeNull();
    expect(parseCAIP10(`eip155:8453:${ADDRESS}`)).toEqual({
      namespace: 'eip155',
      chainId: 8453,
      address: ADDRESS,
    });
  });
});
