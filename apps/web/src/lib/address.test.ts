import { describe, it, expect } from 'vitest';
import {
  truncateAddress,
  isValidEthereumAddress,
  formatAddress,
  areAddressesEqual,
  isAddressString,
} from './address';

describe('address utilities', () => {
  // Using a known valid checksummed address (vitalik.eth)
  const validAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const validAddressLower = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
  const validAddressChecksum = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  describe('truncateAddress', () => {
    it('truncates address with default chars (4)', () => {
      expect(truncateAddress(validAddress)).toBe('0xd8dA...6045');
    });

    it('truncates address with custom chars', () => {
      expect(truncateAddress(validAddress, 6)).toBe('0xd8dA6B...A96045');
    });

    it('returns empty string for empty input', () => {
      expect(truncateAddress('')).toBe('');
    });

    it('returns full address if shorter than truncation', () => {
      expect(truncateAddress('0x1234', 10)).toBe('0x1234');
    });

    it('handles 2 chars truncation', () => {
      expect(truncateAddress(validAddress, 2)).toBe('0xd8...45');
    });
  });

  describe('isValidEthereumAddress', () => {
    it('returns true for valid checksummed address', () => {
      expect(isValidEthereumAddress(validAddress)).toBe(true);
    });

    it('returns true for valid lowercase address', () => {
      expect(isValidEthereumAddress(validAddressLower)).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isValidEthereumAddress('')).toBe(false);
    });

    it('returns false for invalid address (wrong length)', () => {
      expect(isValidEthereumAddress('0x1234')).toBe(false);
    });

    it('returns false for invalid address (no 0x prefix)', () => {
      expect(isValidEthereumAddress('742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')).toBe(false);
    });

    it('returns false for invalid characters', () => {
      expect(isValidEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bZZZ')).toBe(false);
    });

    it('returns false for null-like values', () => {
      // @ts-expect-error - testing invalid input
      expect(isValidEthereumAddress(null)).toBe(false);
      // @ts-expect-error - testing invalid input
      expect(isValidEthereumAddress(undefined)).toBe(false);
    });
  });

  describe('formatAddress', () => {
    it('returns checksummed address from lowercase', () => {
      expect(formatAddress(validAddressLower)).toBe(validAddressChecksum);
    });

    it('returns same address if already checksummed', () => {
      expect(formatAddress(validAddressChecksum)).toBe(validAddressChecksum);
    });

    it('throws for invalid address', () => {
      expect(() => formatAddress('invalid')).toThrow();
    });
  });

  describe('areAddressesEqual', () => {
    it('returns true for same address different case', () => {
      expect(areAddressesEqual(validAddress, validAddressLower)).toBe(true);
    });

    it('returns true for identical addresses', () => {
      expect(areAddressesEqual(validAddress, validAddress)).toBe(true);
    });

    it('returns false for different addresses', () => {
      const otherAddress = '0x1234567890123456789012345678901234567890';
      expect(areAddressesEqual(validAddress, otherAddress)).toBe(false);
    });

    it('returns false if either address is null/undefined', () => {
      expect(areAddressesEqual(validAddress, null)).toBe(false);
      expect(areAddressesEqual(null, validAddress)).toBe(false);
      expect(areAddressesEqual(undefined, undefined)).toBe(false);
    });

    it('returns false for invalid addresses', () => {
      expect(areAddressesEqual(validAddress, 'invalid')).toBe(false);
      expect(areAddressesEqual('invalid', validAddress)).toBe(false);
    });
  });

  describe('isAddressString', () => {
    it('returns true for valid address string', () => {
      expect(isAddressString(validAddress)).toBe(true);
    });

    it('returns false for non-string values', () => {
      expect(isAddressString(123)).toBe(false);
      expect(isAddressString(null)).toBe(false);
      expect(isAddressString(undefined)).toBe(false);
      expect(isAddressString({})).toBe(false);
    });

    it('returns false for invalid address strings', () => {
      expect(isAddressString('not-an-address')).toBe(false);
      expect(isAddressString('0x123')).toBe(false);
    });
  });
});
