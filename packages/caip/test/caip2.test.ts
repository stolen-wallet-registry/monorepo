import { describe, it, expect } from 'vitest';
import { toCAIP2, parseCAIP2, isValidCAIP2, caip2ToNumericChainId } from '../src/caip2';

describe('toCAIP2', () => {
  it('converts numeric chain ID to CAIP-2 string', () => {
    expect(toCAIP2(1)).toBe('eip155:1');
    expect(toCAIP2(8453)).toBe('eip155:8453');
    expect(toCAIP2(31337)).toBe('eip155:31337');
  });

  it('handles large chain IDs', () => {
    expect(toCAIP2(42161)).toBe('eip155:42161');
    expect(toCAIP2(11155111)).toBe('eip155:11155111');
  });

  it('throws for invalid chain IDs', () => {
    expect(() => toCAIP2(-1)).toThrow('Invalid chain ID');
    expect(() => toCAIP2(3.14)).toThrow('Invalid chain ID');
    expect(() => toCAIP2(NaN)).toThrow('Invalid chain ID');
  });
});

describe('parseCAIP2', () => {
  it('parses valid CAIP-2 strings', () => {
    expect(parseCAIP2('eip155:1')).toEqual({
      namespace: 'eip155',
      chainId: '1',
    });
    expect(parseCAIP2('eip155:8453')).toEqual({
      namespace: 'eip155',
      chainId: '8453',
    });
  });

  it('parses non-EVM CAIP-2 strings', () => {
    expect(parseCAIP2('solana:mainnet')).toEqual({
      namespace: 'solana',
      chainId: 'mainnet',
    });
    expect(parseCAIP2('bip122:000000000019d6689c085ae165831e93')).toEqual({
      namespace: 'bip122',
      chainId: '000000000019d6689c085ae165831e93',
    });
  });

  it('returns null for invalid formats', () => {
    expect(parseCAIP2('')).toBeNull();
    expect(parseCAIP2('invalid')).toBeNull();
    expect(parseCAIP2('eip155')).toBeNull();
    expect(parseCAIP2('eip155:1:extra')).toBeNull();
  });

  it('returns null for invalid namespace/chainId per CAIP-2 spec', () => {
    // Namespace must be 3-8 chars, lowercase alphanumeric with hyphens
    expect(parseCAIP2('ab:1')).toBeNull(); // namespace too short
    expect(parseCAIP2('abcdefghi:1')).toBeNull(); // namespace too long
    expect(parseCAIP2('EIP155:1')).toBeNull(); // uppercase not allowed
    expect(parseCAIP2(':123')).toBeNull(); // empty namespace
    expect(parseCAIP2('a:xyz')).toBeNull(); // namespace too short
  });
});

describe('isValidCAIP2', () => {
  it('returns true for valid CAIP-2 strings', () => {
    expect(isValidCAIP2('eip155:1')).toBe(true);
    expect(isValidCAIP2('eip155:8453')).toBe(true);
    expect(isValidCAIP2('solana:mainnet')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidCAIP2('')).toBe(false);
    expect(isValidCAIP2('invalid')).toBe(false);
    expect(isValidCAIP2('eip155')).toBe(false);
  });
});

describe('caip2ToNumericChainId', () => {
  it('extracts numeric chain ID from EVM CAIP-2', () => {
    expect(caip2ToNumericChainId('eip155:1')).toBe(1);
    expect(caip2ToNumericChainId('eip155:8453')).toBe(8453);
    expect(caip2ToNumericChainId('eip155:31337')).toBe(31337);
  });

  it('returns null for non-EVM chains', () => {
    expect(caip2ToNumericChainId('solana:mainnet')).toBeNull();
    expect(caip2ToNumericChainId('bip122:000000000019d6689c085ae165831e93')).toBeNull();
  });

  it('returns null for invalid chain IDs', () => {
    expect(caip2ToNumericChainId('eip155:abc')).toBeNull();
    expect(caip2ToNumericChainId('eip155:')).toBeNull();
  });

  // Regression: this used bare `parseInt`, which stops at the first non-digit and returned
  // 8453 for 'eip155:8453abc'. Since caip2ToBytes32 uses this as its only validation, a
  // partially-numeric reference sailed through and got hashed into permanent on-chain storage.
  it('rejects references that are not a pure decimal integer', () => {
    expect(caip2ToNumericChainId('eip155:8453abc')).toBeNull();
    expect(caip2ToNumericChainId('eip155:8453-')).toBeNull();
    expect(caip2ToNumericChainId('eip155:84_53')).toBeNull();
    expect(caip2ToNumericChainId('eip155:0x2105')).toBeNull();
  });

  // The CAIP-2 spec allows alphanumeric references, so the generic format check cannot be the
  // guard for eip155 — 'eip155:8453abc' is a well-formed CAIP-2 string that is still not a
  // valid EVM chain reference.
  it('is stricter than isValidCAIP2 for the eip155 namespace', () => {
    expect(isValidCAIP2('eip155:8453abc')).toBe(true);
    expect(caip2ToNumericChainId('eip155:8453abc')).toBeNull();
  });

  it('rejects a namespace that merely starts with eip155', () => {
    expect(caip2ToNumericChainId('eip1550:8453')).toBeNull();
  });
});
