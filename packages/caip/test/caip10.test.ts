import { describe, it, expect } from 'vitest';
import {
  toCAIP10,
  toCAIP10FromCAIP2,
  parseCAIP10,
  isValidCAIP10,
  extractAddressFromCAIP10,
  extractCAIP2FromCAIP10,
} from '../src/caip10';

const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e83c4b3a1';
const TEST_ADDRESS_LOWER = TEST_ADDRESS.toLowerCase();

describe('toCAIP10', () => {
  it('creates CAIP-10 string from address and chain ID', () => {
    expect(toCAIP10(TEST_ADDRESS, 1)).toBe(`eip155:1:${TEST_ADDRESS_LOWER}`);
    expect(toCAIP10(TEST_ADDRESS, 8453)).toBe(`eip155:8453:${TEST_ADDRESS_LOWER}`);
  });

  it('lowercases the address', () => {
    const result = toCAIP10(TEST_ADDRESS, 1);
    expect(result).not.toContain('C');
    expect(result).toContain(TEST_ADDRESS_LOWER);
  });
});

describe('toCAIP10FromCAIP2', () => {
  it('creates CAIP-10 from address and CAIP-2', () => {
    expect(toCAIP10FromCAIP2(TEST_ADDRESS, 'eip155:8453')).toBe(
      `eip155:8453:${TEST_ADDRESS_LOWER}`
    );
  });

  it('works with non-EVM chains', () => {
    expect(toCAIP10FromCAIP2('abc123', 'solana:mainnet')).toBe('solana:mainnet:abc123');
  });
});

describe('parseCAIP10', () => {
  it('parses valid CAIP-10 strings', () => {
    expect(parseCAIP10(`eip155:1:${TEST_ADDRESS}`)).toEqual({
      namespace: 'eip155',
      chainId: '1',
      address: TEST_ADDRESS,
    });
  });

  it('preserves address casing', () => {
    const parsed = parseCAIP10(`eip155:1:${TEST_ADDRESS}`);
    expect(parsed?.address).toBe(TEST_ADDRESS);
  });

  it('returns null for invalid formats', () => {
    expect(parseCAIP10('')).toBeNull();
    expect(parseCAIP10('invalid')).toBeNull();
    expect(parseCAIP10('eip155:1')).toBeNull();
    expect(parseCAIP10('eip155:1:0x123:extra')).toBeNull();
  });
});

describe('isValidCAIP10', () => {
  it('returns true for valid CAIP-10 strings', () => {
    expect(isValidCAIP10(`eip155:1:${TEST_ADDRESS}`)).toBe(true);
    expect(isValidCAIP10(`eip155:8453:${TEST_ADDRESS}`)).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidCAIP10('')).toBe(false);
    expect(isValidCAIP10('eip155:1')).toBe(false);
    expect(isValidCAIP10('invalid')).toBe(false);
  });
});

describe('extractAddressFromCAIP10', () => {
  it('extracts address from valid CAIP-10', () => {
    expect(extractAddressFromCAIP10(`eip155:1:${TEST_ADDRESS}`)).toBe(TEST_ADDRESS);
  });

  it('returns null for invalid CAIP-10', () => {
    expect(extractAddressFromCAIP10('invalid')).toBeNull();
    expect(extractAddressFromCAIP10('eip155:1')).toBeNull();
  });
});

describe('extractCAIP2FromCAIP10', () => {
  it('extracts CAIP-2 from valid CAIP-10', () => {
    expect(extractCAIP2FromCAIP10(`eip155:1:${TEST_ADDRESS}`)).toBe('eip155:1');
    expect(extractCAIP2FromCAIP10(`eip155:8453:${TEST_ADDRESS}`)).toBe('eip155:8453');
  });

  it('returns null for invalid CAIP-10', () => {
    expect(extractCAIP2FromCAIP10('invalid')).toBeNull();
    expect(extractCAIP2FromCAIP10('eip155:1')).toBeNull();
  });
});
