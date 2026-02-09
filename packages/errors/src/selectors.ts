/**
 * Contract error type definitions.
 */

export interface ContractErrorInfo {
  /** Error name as defined in Solidity */
  name: string;
  /** User-friendly message explaining what went wrong */
  message: string;
  /** Optional action the user should take */
  action?: string;
}

/**
 * Contract error selectors mapped to error info.
 *
 * When adding new errors to smart contracts:
 * 1. Define error in Solidity: `error MyContract__ErrorName();`
 * 2. Compute selector: `cast sig 'MyContract__ErrorName()'`
 * 3. Add entry to this map
 * 4. Write clear, actionable message for users
 *
 * Notes:
 * - Prefer mapping errors that are actually reverted by current implementations.
 * - Errors declared in interfaces but never reverted are intentionally excluded.
 */
export const CONTRACT_ERROR_SELECTORS: Record<string, ContractErrorInfo> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // FraudRegistryHub Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x92788ffd': {
    name: 'FraudRegistryHub__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0x25da34a1': {
    name: 'FraudRegistryHub__OnlyInbox',
    message: 'Only the cross-chain inbox can call this function.',
    action: 'Please contact support.',
  },
  '0xf6c88e35': {
    name: 'FraudRegistryHub__InvalidIdentifierLength',
    message: 'Invalid identifier length.',
    action: 'Ensure the identifier is a 0x-prefixed 32-byte hex string (66 characters).',
  },
  '0x7fa366d3': {
    name: 'FraudRegistryHub__WithdrawFailed',
    message: 'Fee withdrawal failed.',
    action: 'Please try again.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WalletRegistry Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0xa74e7b8b': {
    name: 'WalletRegistry__AlreadyRegistered',
    message: 'This wallet is already registered.',
    action: 'Search the registry to view its status.',
  },
  '0x133ee0d6': {
    name: 'WalletRegistry__AlreadyAcknowledged',
    message: 'This wallet already has a pending acknowledgement.',
    action: 'Complete the registration or wait for it to expire.',
  },
  '0x5915fdb8': {
    name: 'WalletRegistry__DeadlineExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0x5bc89f7d': {
    name: 'WalletRegistry__DeadlineInPast',
    message: 'Signature deadline is in the past.',
    action: 'Please generate a new signature.',
  },
  '0x3214c145': {
    name: 'WalletRegistry__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0xbf69e113': {
    name: 'WalletRegistry__InvalidSignature',
    message: 'Signature verification failed.',
    action: 'Please sign again with the correct wallet.',
  },
  '0x6bd7e909': {
    name: 'WalletRegistry__NotAuthorizedForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Use the wallet that acknowledged the registration.',
  },
  '0x747dde89': {
    name: 'WalletRegistry__InsufficientFee',
    message: 'Insufficient registration fee.',
    action: 'Please include the required fee.',
  },
  '0x0a17bc56': {
    name: 'WalletRegistry__FeeTransferFailed',
    message: 'Failed to transfer registration fee.',
    action: 'Please try again or contact support.',
  },
  '0x4e71ab39': {
    name: 'WalletRegistry__RefundFailed',
    message: 'Failed to refund excess fee.',
    action: 'Please try again or contact support.',
  },
  '0xa6565bcd': {
    name: 'WalletRegistry__ZeroAddress',
    message: 'Invalid wallet address provided.',
    action: 'Please check the address and try again.',
  },
  '0x31a0af95': {
    name: 'WalletRegistry__OnlyHub',
    message: 'Only the hub can perform this action.',
    action: 'Please contact support.',
  },
  '0x637b467b': {
    name: 'WalletRegistry__OnlyOperatorSubmitter',
    message: 'Only the operator submitter can perform this action.',
    action: 'Please contact support.',
  },
  '0x5934e5e0': {
    name: 'WalletRegistry__InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0x39f0ba50': {
    name: 'WalletRegistry__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one item.',
  },
  '0x545fd576': {
    name: 'WalletRegistry__ArrayLengthMismatch',
    message: 'Data arrays have mismatched lengths.',
    action: 'Please verify the inputs and try again.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TransactionRegistry Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x378855ef': {
    name: 'TransactionRegistry__AlreadyAcknowledged',
    message: 'This transaction batch already has a pending acknowledgement.',
    action: 'Complete the registration or wait for it to expire.',
  },
  '0x2015cf13': {
    name: 'TransactionRegistry__DeadlineExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0x98de1e59': {
    name: 'TransactionRegistry__DeadlineInPast',
    message: 'Signature deadline is in the past.',
    action: 'Please generate a new signature.',
  },
  '0xe4fcb386': {
    name: 'TransactionRegistry__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x6376fd7d': {
    name: 'TransactionRegistry__InvalidSignature',
    message: 'Signature verification failed.',
    action: 'Please sign again with the correct wallet.',
  },
  '0x9e63d130': {
    name: 'TransactionRegistry__NotAuthorizedForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Use the wallet that acknowledged the registration.',
  },
  '0xe0ff51d7': {
    name: 'TransactionRegistry__InsufficientFee',
    message: 'Insufficient registration fee.',
    action: 'Please include the required fee.',
  },
  '0xd6a30fe5': {
    name: 'TransactionRegistry__ZeroAddress',
    message: 'Invalid reporter address provided.',
    action: 'Please check the address and try again.',
  },
  '0x6b588216': {
    name: 'TransactionRegistry__OnlyHub',
    message: 'Only the hub can perform this action.',
    action: 'Please contact support.',
  },
  '0x40064f87': {
    name: 'TransactionRegistry__OnlyOperatorSubmitter',
    message: 'Only the operator submitter can perform this action.',
    action: 'Please contact support.',
  },
  '0x1f86fd29': {
    name: 'TransactionRegistry__EmptyBatch',
    message: 'Transaction batch cannot be empty.',
    action: 'Please add at least one transaction.',
  },
  '0x85758e90': {
    name: 'TransactionRegistry__ArrayLengthMismatch',
    message: 'Transaction hashes and chain IDs must have the same length.',
    action: 'Please verify the inputs and try again.',
  },
  '0x97606fef': {
    name: 'TransactionRegistry__DataHashMismatch',
    message: 'Data hash does not match acknowledgement.',
    action: 'Ensure the transaction list matches what was acknowledged.',
  },
  '0xef0b2ab3': {
    name: 'TransactionRegistry__InvalidStep',
    message: 'Invalid registration step.',
    action: 'Please restart the registration flow.',
  },
  '0xc6eb8cd2': {
    name: 'TransactionRegistry__HubTransferFailed',
    message: 'Failed to transfer registration to the hub.',
    action: 'Please try again or contact support.',
  },
  '0xef7a7943': {
    name: 'TransactionRegistry__RefundFailed',
    message: 'Failed to refund excess fee.',
    action: 'Please try again or contact support.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ContractRegistry Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x047c1f80': {
    name: 'ContractRegistry__ZeroAddress',
    message: 'Invalid contract address provided.',
    action: 'Please check the address and try again.',
  },
  '0xc00e0835': {
    name: 'ContractRegistry__OnlyOperatorSubmitter',
    message: 'Only the operator submitter can register contracts.',
    action: 'Contact the DAO to become an approved operator.',
  },
  '0xcd74ea8c': {
    name: 'ContractRegistry__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one contract.',
  },
  '0x0fc15e9d': {
    name: 'ContractRegistry__ArrayLengthMismatch',
    message: 'Contract and chain ID arrays must have the same length.',
    action: 'Ensure each contract has a corresponding chain ID.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OperatorSubmitter Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x13664080': {
    name: 'OperatorSubmitter__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0xbfd711b2': {
    name: 'OperatorSubmitter__NotApprovedOperator',
    message: 'Only approved operators can submit.',
    action: 'Contact the DAO to become an approved operator.',
  },
  '0x0f0c34f7': {
    name: 'OperatorSubmitter__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one item to register.',
  },
  '0x15c1e4ff': {
    name: 'OperatorSubmitter__ArrayLengthMismatch',
    message: 'Data arrays have mismatched lengths.',
    action: 'Please verify your batch data and try again.',
  },
  '0x030ff595': {
    name: 'OperatorSubmitter__InsufficientFee',
    message: 'Insufficient batch fee.',
    action: 'Please include the required operator batch fee.',
  },
  '0x58614d91': {
    name: 'OperatorSubmitter__FeeForwardFailed',
    message: 'Failed to forward fee.',
    action: 'Please try again.',
  },
  '0x0079d758': {
    name: 'OperatorSubmitter__InvalidFeeConfig',
    message: 'Invalid fee configuration.',
    action: 'Please contact support.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CrossChainMessage Library Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0xd5fd8f7a': {
    name: 'CrossChainMessage__InvalidMessageType',
    message: 'Invalid cross-chain message type.',
    action: 'Please contact support.',
  },
  '0x57d73aa3': {
    name: 'CrossChainMessage__UnsupportedVersion',
    message: 'Unsupported cross-chain message version.',
    action: 'Please contact support.',
  },
  '0x2019eeca': {
    name: 'CrossChainMessage__InvalidMessageLength',
    message: 'Invalid cross-chain message length.',
    action: 'Please contact support.',
  },
  '0x315ba0c5': {
    name: 'CrossChainMessage__BatchSizeMismatch',
    message: 'Cross-chain batch size mismatch.',
    action: 'Please contact support.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CrossChainInbox Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x6d50853e': {
    name: 'CrossChainInbox__ZeroAddress',
    message: 'Invalid address in cross-chain message.',
    action: 'Please contact support.',
  },
  '0x4babc769': {
    name: 'CrossChainInbox__OnlyMailbox',
    message: 'Only the mailbox can deliver cross-chain messages.',
    action: 'Please contact support.',
  },
  '0x7d60d71c': {
    name: 'CrossChainInbox__UntrustedSource',
    message: 'Cross-chain message from untrusted source.',
    action: 'Please contact support.',
  },
  '0x249d64fe': {
    name: 'CrossChainInbox__SourceChainMismatch',
    message: 'Cross-chain message from unexpected chain.',
    action: 'Please contact support.',
  },
  '0x2f5f5948': {
    name: 'CrossChainInbox__UnknownMessageType',
    message: 'Unknown cross-chain message type.',
    action: 'Please contact support.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SpokeRegistry Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0xc718cb18': {
    name: 'SpokeRegistry__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0xe08eb492': {
    name: 'SpokeRegistry__InvalidTimingConfig',
    message: 'Invalid timing configuration.',
    action: 'Please contact support.',
  },
  '0x664e4519': {
    name: 'SpokeRegistry__InvalidOwner',
    message: 'Invalid wallet address provided.',
    action: 'Please check the address and try again.',
  },
  '0xcd4e1023': {
    name: 'SpokeRegistry__SignatureExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0x8a2ee99e': {
    name: 'SpokeRegistry__InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0xae315749': {
    name: 'SpokeRegistry__InvalidSigner',
    message: 'Signature verification failed.',
    action: 'Ensure you signed with the wallet you want to register.',
  },
  '0x18a34ddf': {
    name: 'SpokeRegistry__InvalidForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Switch to your gas wallet to submit this transaction.',
  },
  '0xa5434e70': {
    name: 'SpokeRegistry__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x9525dee7': {
    name: 'SpokeRegistry__ForwarderExpired',
    message: 'Your registration window has expired.',
    action: 'Please start the registration process again from the beginning.',
  },
  '0x4160d098': {
    name: 'SpokeRegistry__HubNotConfigured',
    message: 'Hub chain not configured.',
    action: 'Cross-chain registration is not available. Please contact support.',
  },
  '0x6151896c': {
    name: 'SpokeRegistry__InsufficientFee',
    message: 'Insufficient fee for cross-chain registration.',
    action: 'Ensure you have enough ETH for registration and bridge fees.',
  },
  '0x28bcfd67': {
    name: 'SpokeRegistry__RefundFailed',
    message: 'Failed to refund excess fee.',
    action: 'Please try again or contact support.',
  },
  '0xa8682eaf': {
    name: 'SpokeRegistry__WithdrawalFailed',
    message: 'Fee withdrawal failed.',
    action: 'Please try again.',
  },
  '0x6f59b28e': {
    name: 'SpokeRegistry__InvalidHubConfig',
    message: 'Invalid hub configuration.',
    action: 'Please contact support.',
  },
  '0xbefa3abb': {
    name: 'SpokeRegistry__InvalidStep',
    message: 'Invalid signing step.',
    action: 'Please restart the registration flow.',
  },
  '0xe3e9689e': {
    name: 'SpokeRegistry__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one item to register.',
  },
  '0x81a72855': {
    name: 'SpokeRegistry__ArrayLengthMismatch',
    message: 'Data arrays have mismatched lengths.',
    action: 'Please try again. If the issue persists, contact support.',
  },
  '0xba8873e4': {
    name: 'SpokeRegistry__InvalidDataHash',
    message: 'Data hash mismatch.',
    action: 'Your data may have changed. Please start over.',
  },
  '0x9de3b4a9': {
    name: 'SpokeRegistry__DataMismatch',
    message: 'Registration data does not match acknowledgement.',
    action: 'Please restart the registration flow.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAIP10 Library Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0xfd0a5b1e': {
    name: 'CAIP10__InvalidFormat',
    message: 'Invalid CAIP-10 identifier format.',
    action: 'Use namespace:chainId:address (eip155:8453:0x...).',
  },
  '0x96c95b05': {
    name: 'CAIP10__UnsupportedNamespace',
    message: 'Unsupported chain namespace.',
    action: 'Currently only eip155 is supported.',
  },
  '0x31d8ad42': {
    name: 'CAIP10Evm__InvalidAddress',
    message: 'Invalid EVM address in CAIP-10 identifier.',
    action: 'Please check the address and try again.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FeeManager Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0xb05591b8': {
    name: 'Fee__Insufficient',
    message: 'Insufficient fee amount provided.',
    action: 'Please ensure you have enough ETH.',
  },
  '0x3add2ca9': {
    name: 'Fee__InvalidPrice',
    message: 'ETH price is currently unavailable.',
    action: 'Please try again in a few moments.',
  },
  '0x1d3997c8': {
    name: 'Fee__NoOracle',
    message: 'Price oracle is not configured.',
    action: 'Please contact support.',
  },
  '0x82599075': {
    name: 'Fee__StalePrice',
    message: 'ETH price data is stale.',
    action: 'Please try again in a few moments.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OperatorRegistry Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x2c2b0fe3': {
    name: 'OperatorRegistry__ZeroAddress',
    message: 'Invalid operator address provided.',
    action: 'A valid address is required.',
  },
  '0x84fd1a86': {
    name: 'OperatorRegistry__AlreadyApproved',
    message: 'This operator is already approved.',
  },
  '0x970753c1': {
    name: 'OperatorRegistry__NotApproved',
    message: 'This address is not an approved operator.',
  },
  '0x4f93924f': {
    name: 'OperatorRegistry__InvalidCapabilities',
    message: 'Invalid capability configuration.',
    action: 'Capabilities must be between 0x01 and 0x07.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Soulbound Token Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0xbf9e1a75': {
    name: 'NonTransferrable',
    message: 'Soulbound tokens cannot be transferred.',
  },
  '0x750b219c': {
    name: 'WithdrawFailed',
    message: 'Fee withdrawal failed.',
    action: 'Please try again.',
  },
  '0xbb0bac99': {
    name: 'InvalidFeeCollector',
    message: 'Invalid fee collector address.',
    action: 'Please contact support.',
  },
  '0xe48f34f1': {
    name: 'InvalidTranslations',
    message: 'Invalid translations registry address.',
    action: 'Please contact support.',
  },
  '0x2ef38faa': {
    name: 'NotRegisteredOrPending',
    message: 'Wallet is not registered in the Stolen Wallet Registry.',
    action: 'Only wallets that have been registered as stolen can mint.',
  },
  '0xddefae28': {
    name: 'AlreadyMinted',
    message: 'This wallet has already minted its soulbound token.',
  },
  '0x11a1e697': {
    name: 'InvalidRegistry',
    message: 'Invalid registry address.',
    action: 'Please contact support.',
  },
  '0x860b82a9': {
    name: 'BelowMinimum',
    message: 'Donation amount is below the minimum.',
    action: 'Please increase your donation amount.',
  },
  '0x5cd609c7': {
    name: 'InvalidMinWei',
    message: 'Invalid minimum donation amount.',
    action: 'Please contact support.',
  },
  '0xbb97a108': {
    name: 'LanguageNotSupported',
    message: 'The selected language is not supported.',
    action: 'Please select a different language.',
  },
  '0x564576d3': {
    name: 'LanguageAlreadyExists',
    message: 'This language has already been added.',
  },
  '0xecb52231': {
    name: 'EmptyLanguageCode',
    message: 'Language code cannot be empty.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BridgeAdapter Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x2c460928': {
    name: 'BridgeAdapter__InsufficientFee',
    message: 'Insufficient fee for cross-chain message.',
    action: 'Ensure you have enough ETH for the bridge fee.',
  },
  '0x3c8f137c': {
    name: 'BridgeAdapter__UnsupportedChain',
    message: 'This chain is not supported for cross-chain registration.',
    action: 'Please switch to a supported network.',
  },
  '0xb8aa6394': {
    name: 'BridgeAdapter__PayloadTooLarge',
    message: 'Registration data exceeds bridge limits.',
    action: 'Please contact support.',
  },
};

/**
 * Map of error selectors (4-byte hex) to user-friendly error info.
 * Normalized to lowercase for case-insensitive lookups.
 */
export const CONTRACT_ERROR_MAP: Record<string, ContractErrorInfo> = Object.fromEntries(
  Object.entries(CONTRACT_ERROR_SELECTORS).map(([selector, info]) => [selector.toLowerCase(), info])
);
