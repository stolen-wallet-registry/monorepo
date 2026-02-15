import { describe, it, expect, vi } from 'vitest';
import { decodeContractError, getContractErrorInfo, sanitizeErrorMessage } from './decode';
import { CONTRACT_ERROR_SELECTORS } from './selectors';

describe('decodeContractError', () => {
  it('decodes known error selector to user-friendly message', () => {
    const result = decodeContractError('Execution reverted: custom error 0x9525dee7');
    expect(result).toContain('registration window has expired');
  });

  it('returns null for unknown selector', () => {
    expect(decodeContractError('custom error 0x12345678')).toBeNull();
  });

  it('handles case insensitive selector', () => {
    const lower = decodeContractError('custom error 0x9525dee7');
    const upper = decodeContractError('custom error 0x9525DEE7');
    expect(lower).toBe(upper);
  });
});

describe('getContractErrorInfo', () => {
  it('returns error info for known selector', () => {
    const info = getContractErrorInfo('0x9525dee7');
    expect(info?.name).toBe('SpokeRegistry__ForwarderExpired');
  });

  it('returns undefined for unknown selector', () => {
    expect(getContractErrorInfo('0x12345678')).toBeUndefined();
  });
});

describe('sanitizeErrorMessage', () => {
  it('decodes contract custom errors', () => {
    const result = sanitizeErrorMessage(new Error('custom error 0x9525dee7'));
    expect(result).toContain('registration window has expired');
  });

  it('handles user rejection', () => {
    expect(sanitizeErrorMessage(new Error('User rejected the request'))).toContain('cancelled');
  });

  it('strips version info and technical details', () => {
    const result = sanitizeErrorMessage(new Error('Error Version: viem@2.41.2'));
    expect(result).not.toContain('Version:');
    expect(result).not.toContain('viem');
  });

  it('returns generic message for empty/short errors', () => {
    expect(sanitizeErrorMessage(new Error(''))).toContain('unexpected error');
    expect(sanitizeErrorMessage(null)).toContain('unexpected error');
  });

  it('calls logError callback when provided', () => {
    const logError = vi.fn();
    sanitizeErrorMessage(new Error('test'), logError);
    expect(logError).toHaveBeenCalled();
  });

  it('handles non-Error objects', () => {
    expect(sanitizeErrorMessage({ message: 'some error' })).toBeDefined();
    expect(sanitizeErrorMessage('plain string error')).toBeDefined();
  });

  it('handles errors with Raw Call Arguments section', () => {
    const result = sanitizeErrorMessage(new Error('Error occurred Raw Call Arguments: 0x1234...'));
    expect(result).not.toContain('Raw Call Arguments');
  });

  it('handles multiple error patterns in one message', () => {
    const result = sanitizeErrorMessage(
      new Error('custom error 0x9525dee7 Version: viem@2.41.2 Details: something')
    );
    expect(result).toContain('registration window has expired');
    expect(result).not.toContain('Version:');
  });
});

describe('CONTRACT_ERROR_SELECTORS coverage', () => {
  /** All selectors and their expected error names — keeps selector→name mapping honest. */
  const expectedSelectors: Record<string, string> = {
    // FraudRegistryHub
    '0x92788ffd': 'FraudRegistryHub__ZeroAddress',
    '0x25da34a1': 'FraudRegistryHub__OnlyInbox',
    '0xf6c88e35': 'FraudRegistryHub__InvalidIdentifierLength',
    '0x7fa366d3': 'FraudRegistryHub__WithdrawFailed',
    // WalletRegistry
    '0xa74e7b8b': 'WalletRegistry__AlreadyRegistered',
    '0x133ee0d6': 'WalletRegistry__AlreadyAcknowledged',
    '0x5915fdb8': 'WalletRegistry__DeadlineExpired',
    '0x5bc89f7d': 'WalletRegistry__DeadlineInPast',
    '0x3214c145': 'WalletRegistry__GracePeriodNotStarted',
    '0xbf69e113': 'WalletRegistry__InvalidSignature',
    '0x30866145': 'WalletRegistry__InvalidForwarder',
    '0x747dde89': 'WalletRegistry__InsufficientFee',
    '0x0a17bc56': 'WalletRegistry__FeeTransferFailed',
    '0x4e71ab39': 'WalletRegistry__RefundFailed',
    '0xa6565bcd': 'WalletRegistry__ZeroAddress',
    '0x31a0af95': 'WalletRegistry__OnlyHub',
    '0x637b467b': 'WalletRegistry__OnlyOperatorSubmitter',
    '0x5934e5e0': 'WalletRegistry__InvalidNonce',
    '0x39f0ba50': 'WalletRegistry__EmptyBatch',
    '0x545fd576': 'WalletRegistry__ArrayLengthMismatch',
    '0x48193183': 'WalletRegistry__InvalidStep',
    '0x736d30d5': 'WalletRegistry__BatchTooLarge',
    // TransactionRegistry
    '0x378855ef': 'TransactionRegistry__AlreadyAcknowledged',
    '0x2015cf13': 'TransactionRegistry__DeadlineExpired',
    '0x98de1e59': 'TransactionRegistry__DeadlineInPast',
    '0xe4fcb386': 'TransactionRegistry__GracePeriodNotStarted',
    '0x6376fd7d': 'TransactionRegistry__InvalidSignature',
    '0x11780b54': 'TransactionRegistry__InvalidForwarder',
    '0xe0ff51d7': 'TransactionRegistry__InsufficientFee',
    '0xd6a30fe5': 'TransactionRegistry__ZeroAddress',
    '0x6b588216': 'TransactionRegistry__OnlyHub',
    '0x40064f87': 'TransactionRegistry__OnlyOperatorSubmitter',
    '0x1f86fd29': 'TransactionRegistry__EmptyBatch',
    '0x85758e90': 'TransactionRegistry__ArrayLengthMismatch',
    '0x97606fef': 'TransactionRegistry__DataHashMismatch',
    '0xef0b2ab3': 'TransactionRegistry__InvalidStep',
    '0xc6eb8cd2': 'TransactionRegistry__HubTransferFailed',
    '0xef7a7943': 'TransactionRegistry__RefundFailed',
    '0x5fa98a5a': 'TransactionRegistry__BatchTooLarge',
    '0x351d3c29': 'TransactionRegistry__InvalidTxHashLength',
    // ContractRegistry
    '0x047c1f80': 'ContractRegistry__ZeroAddress',
    '0xc00e0835': 'ContractRegistry__OnlyOperatorSubmitter',
    '0xcd74ea8c': 'ContractRegistry__EmptyBatch',
    '0x0fc15e9d': 'ContractRegistry__ArrayLengthMismatch',
    '0x5b743ae3': 'ContractRegistry__BatchTooLarge',
    // OperatorSubmitter
    '0x13664080': 'OperatorSubmitter__ZeroAddress',
    '0xbfd711b2': 'OperatorSubmitter__NotApprovedOperator',
    '0x0f0c34f7': 'OperatorSubmitter__EmptyBatch',
    '0x15c1e4ff': 'OperatorSubmitter__ArrayLengthMismatch',
    '0x030ff595': 'OperatorSubmitter__InsufficientFee',
    '0x58614d91': 'OperatorSubmitter__FeeForwardFailed',
    '0xb951fb83': 'OperatorSubmitter__RefundFailed',
    '0x0079d758': 'OperatorSubmitter__InvalidFeeConfig',
    // CrossChainMessage
    '0xd5fd8f7a': 'CrossChainMessage__InvalidMessageType',
    '0x57d73aa3': 'CrossChainMessage__UnsupportedVersion',
    '0x2019eeca': 'CrossChainMessage__InvalidMessageLength',
    '0x315ba0c5': 'CrossChainMessage__BatchSizeMismatch',
    // CrossChainInbox
    '0x6d50853e': 'CrossChainInbox__ZeroAddress',
    '0x4babc769': 'CrossChainInbox__OnlyMailbox',
    '0x7d60d71c': 'CrossChainInbox__UntrustedSource',
    '0x249d64fe': 'CrossChainInbox__SourceChainMismatch',
    '0x2f5f5948': 'CrossChainInbox__UnknownMessageType',
    '0x0634f9a3': 'CrossChainInbox__DuplicateMessage',
    // SpokeRegistry
    '0xc718cb18': 'SpokeRegistry__ZeroAddress',
    '0xe08eb492': 'SpokeRegistry__InvalidTimingConfig',
    '0x664e4519': 'SpokeRegistry__InvalidOwner',
    '0xcd4e1023': 'SpokeRegistry__SignatureExpired',
    '0x8a2ee99e': 'SpokeRegistry__InvalidNonce',
    '0xae315749': 'SpokeRegistry__InvalidSigner',
    '0x18a34ddf': 'SpokeRegistry__InvalidForwarder',
    '0xa5434e70': 'SpokeRegistry__GracePeriodNotStarted',
    '0x9525dee7': 'SpokeRegistry__ForwarderExpired',
    '0x4160d098': 'SpokeRegistry__HubNotConfigured',
    '0x6151896c': 'SpokeRegistry__InsufficientFee',
    '0x28bcfd67': 'SpokeRegistry__RefundFailed',
    '0xa8682eaf': 'SpokeRegistry__WithdrawalFailed',
    '0x6f59b28e': 'SpokeRegistry__InvalidHubConfig',
    '0xbefa3abb': 'SpokeRegistry__InvalidStep',
    '0xe3e9689e': 'SpokeRegistry__EmptyBatch',
    '0x81a72855': 'SpokeRegistry__ArrayLengthMismatch',
    '0xba8873e4': 'SpokeRegistry__InvalidDataHash',
    '0x9de3b4a9': 'SpokeRegistry__DataMismatch',
    // CAIP10
    '0xfd0a5b1e': 'CAIP10__InvalidFormat',
    '0x96c95b05': 'CAIP10__UnsupportedNamespace',
    '0x31d8ad42': 'CAIP10Evm__InvalidAddress',
    // FeeManager
    '0xb05591b8': 'Fee__Insufficient',
    '0x3add2ca9': 'Fee__InvalidPrice',
    '0x1d3997c8': 'Fee__NoOracle',
    '0x82599075': 'Fee__StalePrice',
    // OperatorRegistry
    '0x2c2b0fe3': 'OperatorRegistry__ZeroAddress',
    '0x84fd1a86': 'OperatorRegistry__AlreadyApproved',
    '0x970753c1': 'OperatorRegistry__NotApproved',
    '0x4f93924f': 'OperatorRegistry__InvalidCapabilities',
    // Soulbound
    '0xbf9e1a75': 'NonTransferrable',
    '0x750b219c': 'WithdrawFailed',
    '0xbb0bac99': 'InvalidFeeCollector',
    '0xe48f34f1': 'InvalidTranslations',
    '0x2ef38faa': 'NotRegisteredOrPending',
    '0xddefae28': 'AlreadyMinted',
    '0x11a1e697': 'InvalidRegistry',
    '0x860b82a9': 'BelowMinimum',
    '0x5cd609c7': 'InvalidMinWei',
    '0xbb97a108': 'LanguageNotSupported',
    '0x564576d3': 'LanguageAlreadyExists',
    '0xecb52231': 'EmptyLanguageCode',
    // BridgeAdapter
    '0x2c460928': 'BridgeAdapter__InsufficientFee',
    '0x3c8f137c': 'BridgeAdapter__UnsupportedChain',
    '0xb8aa6394': 'BridgeAdapter__PayloadTooLarge',
  };

  it('every expected selector is present with the correct name', () => {
    for (const [selector, expectedName] of Object.entries(expectedSelectors)) {
      const info = CONTRACT_ERROR_SELECTORS[selector];
      expect(info, `Missing selector ${selector} (${expectedName})`).toBeDefined();
      expect(info.name).toBe(expectedName);
    }
  });

  it('no unexpected selectors exist (catches additions without test coverage)', () => {
    const actualSelectors = Object.keys(CONTRACT_ERROR_SELECTORS);
    const expectedKeys = Object.keys(expectedSelectors);
    expect(actualSelectors.sort()).toEqual(expectedKeys.sort());
  });
});
