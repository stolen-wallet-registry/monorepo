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
    // V2 FraudRegistryHubV2 errors (5)
    FraudRegistryHubV2__ZeroAddress: '0x7b8aa786',
    FraudRegistryHubV2__OnlyInbox: '0x463051ce',
    FraudRegistryHubV2__InvalidIdentifierLength: '0xe706f014',
    FraudRegistryHubV2__UnknownRegistryType: '0x79fc992a',
    FraudRegistryHubV2__WithdrawFailed: '0x6317676b',
    // V2 WalletRegistryV2 errors (15)
    WalletRegistryV2__AlreadyRegistered: '0x07d38419',
    WalletRegistryV2__AlreadyAcknowledged: '0x2055835e',
    WalletRegistryV2__NotAcknowledged: '0x9d0170bd',
    WalletRegistryV2__DeadlineExpired: '0xf5916161',
    WalletRegistryV2__DeadlineInPast: '0xe69d38d2',
    WalletRegistryV2__GracePeriodNotStarted: '0xb4945575',
    WalletRegistryV2__InvalidSignature: '0x68611c32',
    WalletRegistryV2__InvalidSigner: '0xa3f32d50',
    WalletRegistryV2__NotAuthorizedForwarder: '0x7347c19f',
    WalletRegistryV2__InsufficientFee: '0x1a5595d9',
    WalletRegistryV2__ZeroAddress: '0x35223e8e',
    WalletRegistryV2__OnlyHub: '0x003b91cb',
    WalletRegistryV2__OnlyOperatorSubmitter: '0x36e01a5b',
    WalletRegistryV2__EmptyBatch: '0x204fb9b9',
    WalletRegistryV2__ArrayLengthMismatch: '0x94a50787',
    // V2 TransactionRegistryV2 errors (19)
    TransactionRegistryV2__AlreadyRegistered: '0xc279298b',
    TransactionRegistryV2__AlreadyAcknowledged: '0x17659821',
    TransactionRegistryV2__NotAcknowledged: '0x57c093b9',
    TransactionRegistryV2__DeadlineExpired: '0x09cb7eb6',
    TransactionRegistryV2__DeadlineInPast: '0x40a02780',
    TransactionRegistryV2__GracePeriodNotStarted: '0x260be5b0',
    TransactionRegistryV2__InvalidSignature: '0x38bd4206',
    TransactionRegistryV2__InvalidSigner: '0x2eec674d',
    TransactionRegistryV2__NotAuthorizedForwarder: '0xc1caf254',
    TransactionRegistryV2__InsufficientFee: '0x800d138f',
    TransactionRegistryV2__ZeroAddress: '0x17e6065b',
    TransactionRegistryV2__OnlyHub: '0x83c11802',
    TransactionRegistryV2__OnlyOperatorSubmitter: '0x45e73680',
    TransactionRegistryV2__EmptyBatch: '0x42c9bec0',
    TransactionRegistryV2__ArrayLengthMismatch: '0xf7626ca5',
    TransactionRegistryV2__DataHashMismatch: '0xcaf23a5c',
    TransactionRegistryV2__InvalidStep: '0xec906808',
    TransactionRegistryV2__HubTransferFailed: '0x2b41b959',
    TransactionRegistryV2__RefundFailed: '0x57185e22',
    // V2 ContractRegistryV2 errors (5)
    ContractRegistryV2__AlreadyRegistered: '0x181fd563',
    ContractRegistryV2__ZeroAddress: '0xe35a3d90',
    ContractRegistryV2__OnlyOperatorSubmitter: '0x75e566b0',
    ContractRegistryV2__EmptyBatch: '0x7e211981',
    ContractRegistryV2__ArrayLengthMismatch: '0x2171219a',
    // V2 OperatorSubmitterV2 errors (7)
    OperatorSubmitterV2__ZeroAddress: '0x862624c3',
    OperatorSubmitterV2__NotApprovedOperator: '0x498aaa04',
    OperatorSubmitterV2__EmptyBatch: '0x84155f3c',
    OperatorSubmitterV2__ArrayLengthMismatch: '0x3f7ebde1',
    OperatorSubmitterV2__InsufficientFee: '0x2ae4ced4',
    OperatorSubmitterV2__FeeForwardFailed: '0xc12f791a',
    OperatorSubmitterV2__InvalidFeeConfig: '0xd2e0c1e5',
    // V2 CAIP-10 parsing errors (3)
    CAIP10__InvalidFormat: '0xfd0a5b1e',
    CAIP10__UnsupportedNamespace: '0x96c95b05',
    CAIP10Evm__InvalidAddress: '0x31d8ad42',
    // V2 CrossChainMessageV2 errors (4)
    CrossChainMessageV2__InvalidMessageType: '0x3f56613b',
    CrossChainMessageV2__UnsupportedVersion: '0x4bf3cb4b',
    CrossChainMessageV2__InvalidMessageLength: '0x49036e73',
    CrossChainMessageV2__BatchSizeMismatch: '0x0bc8e29a',
    // V2 CrossChainInboxV2 errors (5)
    CrossChainInboxV2__ZeroAddress: '0x9705f71a',
    CrossChainInboxV2__OnlyMailbox: '0x462ea0ab',
    CrossChainInboxV2__UntrustedSource: '0x0e8260da',
    CrossChainInboxV2__SourceChainMismatch: '0xf6407ddf',
    CrossChainInboxV2__UnknownMessageType: '0xb039e7a9',
    // V2 SpokeRegistryV2 errors (17)
    SpokeRegistryV2__ZeroAddress: '0x8b4b46c4',
    SpokeRegistryV2__InvalidTimingConfig: '0x3d8ff737',
    SpokeRegistryV2__InvalidOwner: '0xc4069ba2',
    SpokeRegistryV2__SignatureExpired: '0x860f06c2',
    SpokeRegistryV2__InvalidNonce: '0x58f53864',
    SpokeRegistryV2__InvalidSigner: '0x3a8e63c6',
    SpokeRegistryV2__InvalidForwarder: '0x2f4c1872',
    SpokeRegistryV2__GracePeriodNotStarted: '0xb23325c9',
    SpokeRegistryV2__ForwarderExpired: '0x2fab8da5',
    SpokeRegistryV2__HubNotConfigured: '0xc343d197',
    SpokeRegistryV2__InsufficientFee: '0x9ea3c99b',
    SpokeRegistryV2__RefundFailed: '0x99b352da',
    SpokeRegistryV2__WithdrawalFailed: '0x141e8e83',
    SpokeRegistryV2__InvalidHubConfig: '0x16392cf6',
    SpokeRegistryV2__EmptyBatch: '0x339a0ecf',
    SpokeRegistryV2__ArrayLengthMismatch: '0xaef92cb3',
    SpokeRegistryV2__InvalidDataHash: '0x06cf9d53',
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
