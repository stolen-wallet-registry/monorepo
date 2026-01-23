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
});
