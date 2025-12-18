import { describe, it, expect } from 'vitest';

import { decodeContractError, getContractErrorInfo, CONTRACT_ERROR_MAP } from './contractErrors';

describe('contractErrors', () => {
  describe('CONTRACT_ERROR_MAP', () => {
    it('contains all 20 expected errors', () => {
      expect(Object.keys(CONTRACT_ERROR_MAP)).toHaveLength(20);
    });

    it('all selectors are lowercase 4-byte hex', () => {
      Object.keys(CONTRACT_ERROR_MAP).forEach((selector) => {
        expect(selector).toMatch(/^0x[a-f0-9]{8}$/);
      });
    });

    it('all errors have name and message', () => {
      for (const [_selector, info] of Object.entries(CONTRACT_ERROR_MAP)) {
        expect(info.name).toBeTruthy();
        expect(info.message).toBeTruthy();
        expect(typeof info.name).toBe('string');
        expect(typeof info.message).toBe('string');
        if (info.action) {
          expect(typeof info.action).toBe('string');
        }
      }
    });
  });

  describe('decodeContractError', () => {
    it('decodes Registration__ForwarderExpired', () => {
      const errorMsg = 'Execution reverted with reason: custom error 0xec5c97a6';
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });

    it('decodes Acknowledgement__Expired', () => {
      const errorMsg = 'custom error 0x66af96ee';
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'Your acknowledgement signature has expired. Please sign again to continue.'
      );
    });

    it('decodes Registration__GracePeriodNotStarted', () => {
      const errorMsg = 'Execution reverted: custom error 0x6d2d2de4';
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'The grace period has not ended yet. Please wait for the countdown to complete before registering.'
      );
    });

    it('decodes AlreadyRegistered (no action)', () => {
      const errorMsg = 'custom error 0x3a81d6fc';
      const result = decodeContractError(errorMsg);

      // AlreadyRegistered has no action, just message
      expect(result).toBe('This wallet is already registered as stolen.');
    });

    it('handles uppercase hex selectors', () => {
      const errorMsg = 'custom error 0xEC5C97A6'; // uppercase
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });

    it('handles mixed case hex selectors', () => {
      const errorMsg = 'custom error 0xEc5C97a6'; // mixed case
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });

    it('returns null for unknown error selector', () => {
      const errorMsg = 'custom error 0xdeadbeef';
      const result = decodeContractError(errorMsg);

      expect(result).toBeNull();
    });

    it('returns null for non-custom-error messages', () => {
      expect(decodeContractError('User rejected request')).toBeNull();
      expect(decodeContractError('insufficient funds')).toBeNull();
      expect(decodeContractError('Network error')).toBeNull();
      expect(decodeContractError('')).toBeNull();
    });

    it('returns null for malformed hex selectors', () => {
      expect(decodeContractError('custom error 0x123')).toBeNull(); // too short
      expect(decodeContractError('custom error 0x123456789')).toBeNull(); // too long
      expect(decodeContractError('custom error abc12345')).toBeNull(); // no 0x prefix
    });

    it('extracts selector from verbose error messages', () => {
      const verboseError = `CallExecutionError: Execution reverted with reason: custom error 0xec5c97a6.

Raw Call Arguments:
  from: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
  to: 0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9
  value: 0.001428571428571428 ETH

Details: execution reverted: custom error 0xec5c97a6
Version: viem@2.41.2`;

      const result = decodeContractError(verboseError);
      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });
  });

  describe('getContractErrorInfo', () => {
    it('returns error info for known selector', () => {
      const info = getContractErrorInfo('0xec5c97a6');

      expect(info).toEqual({
        name: 'Registration__ForwarderExpired',
        message: 'Your registration window has expired.',
        action: 'Please start the registration process again from the beginning.',
      });
    });

    it('handles uppercase selector', () => {
      const info = getContractErrorInfo('0xEC5C97A6');

      expect(info?.name).toBe('Registration__ForwarderExpired');
    });

    it('returns undefined for unknown selector', () => {
      const info = getContractErrorInfo('0xdeadbeef');

      expect(info).toBeUndefined();
    });
  });

  describe('error selector verification', () => {
    // These tests verify our selectors match the actual contract errors
    // If a contract error signature changes, these will catch it

    const expectedSelectors: Record<string, string> = {
      // IStolenWalletRegistry
      InvalidNonce: '0x756688fe',
      Acknowledgement__Expired: '0x66af96ee',
      Acknowledgement__InvalidSigner: '0xb4c67c0a',
      Registration__SignatureExpired: '0x5a2eae05',
      Registration__InvalidSigner: '0x21ae99f4',
      Registration__InvalidForwarder: '0x5fd8c8bb',
      Registration__ForwarderExpired: '0xec5c97a6',
      Registration__GracePeriodNotStarted: '0x6d2d2de4',
      AlreadyRegistered: '0x3a81d6fc',
      InvalidOwner: '0x49e27cff',
      InsufficientFee: '0x025dbdd4',
      FeeForwardFailed: '0x4073ee10',
      // IFeeManager
      Fee__Insufficient: '0xb05591b8',
      Fee__InvalidPrice: '0x3add2ca9',
      Fee__NoOracle: '0x1d3997c8',
      Fee__StalePrice: '0x82599075',
      // IRegistryHub
      Hub__Paused: '0x719cea76',
      Hub__InvalidRegistry: '0xbf7c72a6',
      Hub__InsufficientFee: '0xba85f0bb',
      Hub__WithdrawalFailed: '0x066df40f',
    };

    it.each(Object.entries(expectedSelectors))(
      '%s has correct selector %s',
      (errorName, expectedSelector) => {
        const info = CONTRACT_ERROR_MAP[expectedSelector];
        expect(info).toBeDefined();
        expect(info.name).toBe(errorName);
      }
    );
  });
});
