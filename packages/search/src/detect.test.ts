import { describe, it, expect } from 'vitest';
import { detectSearchType, isCAIP10, parseCAIP10, parseWildcardCAIP10 } from './detect';

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
