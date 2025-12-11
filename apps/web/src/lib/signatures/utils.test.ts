import { describe, it, expect } from 'vitest';
import {
  parseSignature,
  isSignatureExpired,
  isWithinRegistrationWindow,
  getStepName,
  isValidSignatureFormat,
} from './utils';

describe('signature utilities', () => {
  // Proper 65-byte EIP-712 signature format:
  // r (32 bytes) + s (32 bytes) + v (1 byte)
  // v should be 27 (0x1b) or 28 (0x1c)
  const validSignature =
    '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8538dde03fc8b4c6d7f2c13c82e5c34d0e5f8b1c0b5e2f3a4b5c6d7e8f9a0b1c21b' as `0x${string}`;

  describe('parseSignature', () => {
    it('parses a valid signature into v, r, s components', () => {
      const result = parseSignature(validSignature);

      expect(result).toHaveProperty('v');
      expect(result).toHaveProperty('r');
      expect(result).toHaveProperty('s');

      // v should be 27 or 28 (or sometimes 0/1 for some signatures)
      expect(typeof result.v).toBe('number');

      // r and s should be 32-byte hex strings
      expect(result.r).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(result.s).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('throws for invalid signature format', () => {
      expect(() => parseSignature('0x1234' as `0x${string}`)).toThrow();
    });
  });

  describe('isSignatureExpired', () => {
    it('returns true when current block >= deadline', () => {
      expect(isSignatureExpired(100n, 100n)).toBe(true);
      expect(isSignatureExpired(100n, 150n)).toBe(true);
    });

    it('returns false when current block < deadline', () => {
      expect(isSignatureExpired(100n, 50n)).toBe(false);
      expect(isSignatureExpired(100n, 99n)).toBe(false);
    });

    it('handles large block numbers', () => {
      const deadline = 18_000_000n;
      const current = 17_999_999n;
      expect(isSignatureExpired(deadline, current)).toBe(false);
      expect(isSignatureExpired(deadline, deadline)).toBe(true);
    });
  });

  describe('isWithinRegistrationWindow', () => {
    const startBlock = 100n;
    const deadlineBlock = 200n;

    it('returns true when within window', () => {
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 100n)).toBe(true);
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 150n)).toBe(true);
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 199n)).toBe(true);
    });

    it('returns false when before start', () => {
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 99n)).toBe(false);
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 50n)).toBe(false);
    });

    it('returns false when at or after deadline', () => {
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 200n)).toBe(false);
      expect(isWithinRegistrationWindow(startBlock, deadlineBlock, 250n)).toBe(false);
    });
  });

  describe('getStepName', () => {
    it('returns Acknowledgement for step 1', () => {
      expect(getStepName(1)).toBe('Acknowledgement');
    });

    it('returns Registration for step 2', () => {
      expect(getStepName(2)).toBe('Registration');
    });
  });

  describe('isValidSignatureFormat', () => {
    it('returns true for valid signature format', () => {
      expect(isValidSignatureFormat(validSignature)).toBe(true);
    });

    it('returns false for non-string values', () => {
      expect(isValidSignatureFormat(123)).toBe(false);
      expect(isValidSignatureFormat(null)).toBe(false);
      expect(isValidSignatureFormat(undefined)).toBe(false);
      expect(isValidSignatureFormat({})).toBe(false);
    });

    it('returns false for string without 0x prefix', () => {
      expect(isValidSignatureFormat('1234567890'.repeat(13))).toBe(false);
    });

    it('returns false for wrong length', () => {
      expect(isValidSignatureFormat('0x1234')).toBe(false);
      expect(isValidSignatureFormat('0x' + '00'.repeat(64))).toBe(false); // 64 bytes
      expect(isValidSignatureFormat('0x' + '00'.repeat(66))).toBe(false); // 66 bytes
    });

    it('returns false for invalid hex characters', () => {
      const invalidHex = '0x' + 'zz'.repeat(65);
      expect(isValidSignatureFormat(invalidHex)).toBe(false);
    });
  });
});
