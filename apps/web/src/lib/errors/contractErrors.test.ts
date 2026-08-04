import { describe, it, expect } from 'vitest';

import { decodeContractError, getContractErrorInfo, CONTRACT_ERROR_MAP } from './contractErrors';

describe('contractErrors', () => {
  // NOTE: this file deliberately does NOT mirror the error catalogue.
  //
  // It used to carry an `expectedSelectors` map naming every curated error — a third copy of
  // the same bookkeeping (packages/errors/src/selectors.ts being the source, and
  // decode.test.ts having carried a second). Its own comment conceded the weakness: it
  // "does NOT verify selectors match compiled ABIs", so it could only catch typos in itself
  // while a real rename in Solidity slipped through all three copies.
  //
  // Catalogue coverage is now asserted in packages/errors/src/coverage.test.ts, which DERIVES
  // the expected set from the generated ABIs: every ABI error must be curated or explicitly
  // excluded, every selector must match the real signature, and no entry may reference an
  // error that no longer exists. What remains here is only what is specific to this package:
  // that apps/web's re-export wiring works.

  describe('CONTRACT_ERROR_MAP', () => {
    it('is populated (guards against a broken re-export)', () => {
      // A non-vacuous floor: if the @swr/errors re-export silently resolved to an empty
      // object, every other assertion in this file would pass trivially.
      expect(Object.keys(CONTRACT_ERROR_MAP).length).toBeGreaterThan(50);
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
    it('decodes SpokeRegistry__ForwarderExpired', () => {
      const errorMsg = 'Execution reverted with reason: custom error 0x9525dee7';
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });

    it('decodes WalletRegistry__DeadlineExpired', () => {
      const errorMsg = 'custom error 0x5915fdb8';
      const result = decodeContractError(errorMsg);

      expect(result).toBe('Your signature has expired. Please sign again.');
    });

    it('decodes WalletRegistry__GracePeriodNotStarted', () => {
      const errorMsg = 'Execution reverted: custom error 0x3214c145';
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'The grace period has not ended yet. Please wait for the countdown to complete before registering.'
      );
    });

    it('decodes WalletRegistry__AlreadyRegistered (no action)', () => {
      const errorMsg = 'custom error 0xa74e7b8b';
      const result = decodeContractError(errorMsg);

      // WalletRegistry__AlreadyRegistered has no action field, just message
      expect(result).toBe(
        'This wallet is already registered. Search the registry to view its status.'
      );
    });

    it('handles uppercase hex selectors', () => {
      const errorMsg = 'custom error 0x9525DEE7'; // uppercase
      const result = decodeContractError(errorMsg);

      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });

    it('handles mixed case hex selectors', () => {
      const errorMsg = 'custom error 0x9525DeE7'; // mixed case
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
      const verboseError = `CallExecutionError: Execution reverted with reason: custom error 0x9525dee7.

Raw Call Arguments:
  from: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
  to: 0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9
  value: 0.001428571428571428 ETH

Details: execution reverted: custom error 0x9525dee7
Version: viem@2.41.2`;

      const result = decodeContractError(verboseError);
      expect(result).toBe(
        'Your registration window has expired. Please start the registration process again from the beginning.'
      );
    });
  });

  describe('getContractErrorInfo', () => {
    it('returns error info for known selector', () => {
      const info = getContractErrorInfo('0x9525dee7');

      expect(info).toEqual({
        name: 'SpokeRegistry__ForwarderExpired',
        message: 'Your registration window has expired.',
        action: 'Please start the registration process again from the beginning.',
      });
    });

    it('handles uppercase selector', () => {
      const info = getContractErrorInfo('0x9525DEE7');

      expect(info?.name).toBe('SpokeRegistry__ForwarderExpired');
    });

    it('returns undefined for unknown selector', () => {
      const info = getContractErrorInfo('0xdeadbeef');

      expect(info).toBeUndefined();
    });
  });
});
