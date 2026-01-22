import { describe, it, expect } from 'vitest';

import { decodeContractError, getContractErrorInfo, CONTRACT_ERROR_MAP } from './contractErrors';

describe('contractErrors', () => {
  // Expected selectors from contract interfaces - used for coverage validation
  const expectedSelectors: Record<string, string> = {
    // IStolenWalletRegistry errors (16)
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
    InvalidTimingConfig: '0x87b5e90b',
    UnauthorizedCaller: '0x5c427cd9',
    InvalidBridgeId: '0xb91e5870',
    InvalidChainId: '0x7a47c9a2',
    // ISpokeRegistry errors (10)
    SpokeRegistry__InvalidTimingConfig: '0xe08eb492',
    SpokeRegistry__InvalidNonce: '0x7a15c36a',
    SpokeRegistry__SignatureExpired: '0x36a83b56',
    SpokeRegistry__InvalidSigner: '0x8baa579f',
    SpokeRegistry__InvalidForwarder: '0x6e67e4e2',
    SpokeRegistry__ForwarderExpired: '0x86f63dce',
    SpokeRegistry__GracePeriodNotStarted: '0x9ab3c3ae',
    SpokeRegistry__InsufficientFee: '0xf4d678b8',
    SpokeRegistry__InvalidOwner: '0x664e4519',
    SpokeRegistry__BridgeFailed: '0x0cc5729a',
    // IBridgeAdapter errors (3)
    BridgeAdapter__InsufficientFee: '0x2c460928',
    BridgeAdapter__UnsupportedChain: '0x3c8f137c',
    BridgeAdapter__PayloadTooLarge: '0xb8aa6394',
    // IFeeManager errors (4)
    Fee__Insufficient: '0xb05591b8',
    Fee__InvalidPrice: '0x3add2ca9',
    Fee__NoOracle: '0x1d3997c8',
    Fee__StalePrice: '0x82599075',
    // IRegistryHub errors (5)
    Hub__Paused: '0x719cea76',
    Hub__InvalidRegistry: '0xbf7c72a6',
    Hub__InsufficientFee: '0xba85f0bb',
    Hub__WithdrawalFailed: '0x066df40f',
    Hub__UnauthorizedInbox: '0x8791d1d6',
    // ICrossChainInbox errors (5)
    CrossChainInbox__UntrustedSource: '0x7d60d71c',
    CrossChainInbox__OnlyBridge: '0xaea84e78',
    CrossChainInbox__InvalidMessage: '0x23e92f31',
    CrossChainInbox__ZeroAddress: '0x6d50853e',
    CrossChainInbox__SourceChainMismatch: '0x249d64fe',
    // IOperatorRegistry errors (5)
    OperatorRegistry__ZeroAddress: '0x2c2b0fe3',
    OperatorRegistry__AlreadyApproved: '0x84fd1a86',
    OperatorRegistry__NotApproved: '0x970753c1',
    OperatorRegistry__InvalidCapabilities: '0x4f93924f',
    OperatorRegistry__NotAuthorizedForRegistry: '0x0790c247',
    // IFraudulentContractRegistry errors (6 additional)
    FraudulentContractRegistry__InvalidOperatorRegistry: '0x7020d8c8',
    FraudulentContractRegistry__MissingRegistryHub: '0x3e81b8ca',
    FraudulentContractRegistry__InvalidContractAddress: '0x54689933',
    FraudulentContractRegistry__InvalidChainIdEntry: '0x4b2858dd',
    FraudulentContractRegistry__BatchSizeExceedsLimit: '0x86eaeab5',
    FraudulentContractRegistry__UnexpectedEthWithFeesDisabled: '0xf53a0b5c',
  };

  describe('CONTRACT_ERROR_MAP', () => {
    it('contains at least all expected errors', () => {
      // Self-maintaining: threshold tracks the curated expectedSelectors list
      const expectedCount = Object.keys(expectedSelectors).length;
      expect(Object.keys(CONTRACT_ERROR_MAP).length).toBeGreaterThanOrEqual(expectedCount);
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

  describe('expected selector coverage', () => {
    // Verify CONTRACT_ERROR_MAP has entries for all expected selectors.
    // Note: This does NOT verify selectors match compiled ABIs - it only ensures
    // the curated expectedSelectors list is covered in CONTRACT_ERROR_MAP.
    // If contract error signatures change, update expectedSelectors manually.

    it.each(Object.entries(expectedSelectors))(
      '%s has entry in CONTRACT_ERROR_MAP with selector %s',
      (errorName, expectedSelector) => {
        const info = CONTRACT_ERROR_MAP[expectedSelector];
        expect(info).toBeDefined();
        expect(info.name).toBe(errorName);
      }
    );

    it('has no duplicate selectors (object literal guard)', () => {
      // JavaScript object literals silently override duplicate keys.
      // This test verifies the source of truth (expectedSelectors) has unique values.
      const selectors = Object.values(expectedSelectors);
      const uniqueSelectors = new Set(selectors);
      expect(uniqueSelectors.size).toBe(selectors.length);
    });
  });
});
