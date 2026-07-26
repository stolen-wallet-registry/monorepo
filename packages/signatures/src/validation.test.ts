import { describe, it, expect } from 'vitest';
import type { Hex } from 'viem';
import {
  isSignatureExpired,
  isWithinRegistrationWindow,
  isValidSignatureFormat,
  parseSignature,
} from './validation';

describe('parseSignature', () => {
  const r = '11'.repeat(32);
  const s = '22'.repeat(32);
  const sigWithTrailingByte = (byte: string) => `0x${r}${s}${byte}` as Hex;

  it('parses signatures using the 27/28 v convention', () => {
    expect(parseSignature(sigWithTrailingByte('1b')).v).toBe(27);
    expect(parseSignature(sigWithTrailingByte('1c')).v).toBe(28);
  });

  // viem omits `v` for yParity-style signatures, which some hardware wallets and
  // smart-account signers emit. Without normalization v is NaN and the contract call
  // throws when encoding the uint8 v argument.
  it('normalizes yParity 0/1 signatures to v 27/28', () => {
    expect(parseSignature(sigWithTrailingByte('00')).v).toBe(27);
    expect(parseSignature(sigWithTrailingByte('01')).v).toBe(28);
  });

  it('never returns NaN for any valid trailing byte', () => {
    for (const byte of ['00', '01', '1b', '1c']) {
      expect(Number.isNaN(parseSignature(sigWithTrailingByte(byte)).v)).toBe(false);
    }
  });
});

describe('isSignatureExpired', () => {
  it('returns false when current block is before deadline', () => {
    expect(isSignatureExpired(100n, 99n)).toBe(false);
  });

  it('returns true when current block equals or exceeds deadline', () => {
    expect(isSignatureExpired(100n, 100n)).toBe(true);
    expect(isSignatureExpired(100n, 101n)).toBe(true);
  });
});

describe('isWithinRegistrationWindow', () => {
  // Window is [start, end) - inclusive start, exclusive end
  it('returns false before window opens', () => {
    expect(isWithinRegistrationWindow(100n, 200n, 99n)).toBe(false);
  });

  it('returns true at window start (inclusive)', () => {
    expect(isWithinRegistrationWindow(100n, 200n, 100n)).toBe(true);
  });

  it('returns true within window', () => {
    expect(isWithinRegistrationWindow(100n, 200n, 150n)).toBe(true);
  });

  it('returns false at window end (exclusive)', () => {
    expect(isWithinRegistrationWindow(100n, 200n, 200n)).toBe(false);
  });

  it('returns false after window closes', () => {
    expect(isWithinRegistrationWindow(100n, 200n, 250n)).toBe(false);
  });
});

describe('isValidSignatureFormat', () => {
  const validSig =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

  it('validates 65-byte hex signature with 0x prefix', () => {
    expect(isValidSignatureFormat(validSig)).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(isValidSignatureFormat(null)).toBe(false);
    expect(isValidSignatureFormat(123)).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidSignatureFormat('0x1234')).toBe(false);
  });

  it('rejects invalid hex characters', () => {
    const invalidHex = validSig.replace('a', 'g');
    expect(isValidSignatureFormat(invalidHex)).toBe(false);
  });

  it('rejects signature without 0x prefix', () => {
    expect(isValidSignatureFormat(validSig.slice(2))).toBe(false);
  });

  it('rejects empty and undefined input', () => {
    expect(isValidSignatureFormat('')).toBe(false);
    expect(isValidSignatureFormat(undefined)).toBe(false);
  });
});
