import { describe, it, expect } from 'vitest';

import { decodeContractError, getContractErrorInfo, CONTRACT_ERROR_MAP } from './contractErrors';

describe('contractErrors', () => {
  // Expected selectors for curated runtime errors - used for coverage validation.
  // Note: Some errors are declared in interfaces but never reverted by current implementations,
  // so they are intentionally excluded from this list and from CONTRACT_ERROR_MAP.
  const expectedSelectors: Record<string, string> = {
    // FraudRegistryHub Errors
    FraudRegistryHub__ZeroAddress: '0x92788ffd',
    FraudRegistryHub__OnlyInbox: '0x25da34a1',
    FraudRegistryHub__InvalidIdentifierLength: '0xf6c88e35',
    FraudRegistryHub__WithdrawFailed: '0x7fa366d3',
    // WalletRegistry Errors
    WalletRegistry__AlreadyRegistered: '0xa74e7b8b',
    WalletRegistry__AlreadyAcknowledged: '0x133ee0d6',
    WalletRegistry__DeadlineExpired: '0x5915fdb8',
    WalletRegistry__DeadlineInPast: '0x5bc89f7d',
    WalletRegistry__GracePeriodNotStarted: '0x3214c145',
    WalletRegistry__InvalidSignature: '0xbf69e113',
    WalletRegistry__NotAuthorizedForwarder: '0x6bd7e909',
    WalletRegistry__InsufficientFee: '0x747dde89',
    WalletRegistry__ZeroAddress: '0xa6565bcd',
    WalletRegistry__OnlyHub: '0x31a0af95',
    WalletRegistry__OnlyOperatorSubmitter: '0x637b467b',
    WalletRegistry__EmptyBatch: '0x39f0ba50',
    WalletRegistry__ArrayLengthMismatch: '0x545fd576',
    // TransactionRegistry Errors
    TransactionRegistry__AlreadyAcknowledged: '0x378855ef',
    TransactionRegistry__DeadlineExpired: '0x2015cf13',
    TransactionRegistry__DeadlineInPast: '0x98de1e59',
    TransactionRegistry__GracePeriodNotStarted: '0xe4fcb386',
    TransactionRegistry__InvalidSignature: '0x6376fd7d',
    TransactionRegistry__NotAuthorizedForwarder: '0x9e63d130',
    TransactionRegistry__InsufficientFee: '0xe0ff51d7',
    TransactionRegistry__ZeroAddress: '0xd6a30fe5',
    TransactionRegistry__OnlyHub: '0x6b588216',
    TransactionRegistry__OnlyOperatorSubmitter: '0x40064f87',
    TransactionRegistry__EmptyBatch: '0x1f86fd29',
    TransactionRegistry__ArrayLengthMismatch: '0x85758e90',
    TransactionRegistry__DataHashMismatch: '0x97606fef',
    TransactionRegistry__InvalidStep: '0xef0b2ab3',
    TransactionRegistry__HubTransferFailed: '0xc6eb8cd2',
    TransactionRegistry__RefundFailed: '0xef7a7943',
    // ContractRegistry Errors
    ContractRegistry__ZeroAddress: '0x047c1f80',
    ContractRegistry__OnlyOperatorSubmitter: '0xc00e0835',
    ContractRegistry__EmptyBatch: '0xcd74ea8c',
    ContractRegistry__ArrayLengthMismatch: '0x0fc15e9d',
    // OperatorSubmitter Errors
    OperatorSubmitter__ZeroAddress: '0x13664080',
    OperatorSubmitter__NotApprovedOperator: '0xbfd711b2',
    OperatorSubmitter__EmptyBatch: '0x0f0c34f7',
    OperatorSubmitter__ArrayLengthMismatch: '0x15c1e4ff',
    OperatorSubmitter__InsufficientFee: '0x030ff595',
    OperatorSubmitter__FeeForwardFailed: '0x58614d91',
    OperatorSubmitter__InvalidFeeConfig: '0x0079d758',
    // CAIP-10 parsing errors
    CAIP10__InvalidFormat: '0xfd0a5b1e',
    CAIP10__UnsupportedNamespace: '0x96c95b05',
    CAIP10Evm__InvalidAddress: '0x31d8ad42',
    // CrossChainMessage Library Errors
    CrossChainMessage__InvalidMessageType: '0xd5fd8f7a',
    CrossChainMessage__UnsupportedVersion: '0x57d73aa3',
    CrossChainMessage__InvalidMessageLength: '0x2019eeca',
    CrossChainMessage__BatchSizeMismatch: '0x315ba0c5',
    // CrossChainInbox Errors
    CrossChainInbox__ZeroAddress: '0x6d50853e',
    CrossChainInbox__OnlyMailbox: '0x4babc769',
    CrossChainInbox__UntrustedSource: '0x7d60d71c',
    CrossChainInbox__SourceChainMismatch: '0x249d64fe',
    CrossChainInbox__UnknownMessageType: '0x2f5f5948',
    // SpokeRegistry Errors
    SpokeRegistry__ZeroAddress: '0xc718cb18',
    SpokeRegistry__InvalidTimingConfig: '0xe08eb492',
    SpokeRegistry__InvalidOwner: '0x664e4519',
    SpokeRegistry__SignatureExpired: '0xcd4e1023',
    SpokeRegistry__InvalidNonce: '0x8a2ee99e',
    SpokeRegistry__InvalidSigner: '0xae315749',
    SpokeRegistry__InvalidForwarder: '0x18a34ddf',
    SpokeRegistry__GracePeriodNotStarted: '0xa5434e70',
    SpokeRegistry__ForwarderExpired: '0x9525dee7',
    SpokeRegistry__HubNotConfigured: '0x4160d098',
    SpokeRegistry__InsufficientFee: '0x6151896c',
    SpokeRegistry__RefundFailed: '0x28bcfd67',
    SpokeRegistry__WithdrawalFailed: '0xa8682eaf',
    SpokeRegistry__InvalidHubConfig: '0x6f59b28e',
    SpokeRegistry__EmptyBatch: '0xe3e9689e',
    SpokeRegistry__ArrayLengthMismatch: '0x81a72855',
    SpokeRegistry__InvalidDataHash: '0xba8873e4',
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
        expect(info!.name).toBe(errorName);
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
