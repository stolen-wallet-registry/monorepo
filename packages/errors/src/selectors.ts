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
 */
export const CONTRACT_ERROR_SELECTORS: Record<string, ContractErrorInfo> = {
  '0x756688fe': {
    name: 'InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0x66af96ee': {
    name: 'Acknowledgement__Expired',
    message: 'Your acknowledgement signature has expired.',
    action: 'Please sign again to continue.',
  },
  '0xb4c67c0a': {
    name: 'Acknowledgement__InvalidSigner',
    message: 'Acknowledgement signature verification failed.',
    action: 'Ensure you are signing with the wallet you want to register.',
  },
  '0x5a2eae05': {
    name: 'Registration__SignatureExpired',
    message: 'Your registration signature has expired.',
    action: 'Please sign again to continue.',
  },
  '0x21ae99f4': {
    name: 'Registration__InvalidSigner',
    message: 'Registration signature verification failed.',
    action: 'Ensure you are signing with the wallet you want to register.',
  },
  '0x5fd8c8bb': {
    name: 'Registration__InvalidForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Switch to your gas wallet to submit this transaction.',
  },
  '0xec5c97a6': {
    name: 'Registration__ForwarderExpired',
    message: 'Your registration window has expired.',
    action: 'Please start the registration process again from the beginning.',
  },
  '0x6d2d2de4': {
    name: 'Registration__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x3a81d6fc': {
    name: 'AlreadyRegistered',
    message: 'This wallet is already registered as stolen.',
  },
  '0x49e27cff': {
    name: 'InvalidOwner',
    message: 'Invalid wallet address provided.',
    action: 'Please check the address and try again.',
  },
  '0x025dbdd4': {
    name: 'InsufficientFee',
    message: 'Insufficient protocol fee provided.',
    action: 'Ensure you have enough ETH for the registration fee.',
  },
  '0x4073ee10': {
    name: 'FeeForwardFailed',
    message: 'Failed to process the protocol fee.',
    action: 'Please try again.',
  },
  '0x87b5e90b': {
    name: 'InvalidTimingConfig',
    message: 'Invalid timing configuration detected.',
    action: 'Please contact support.',
  },
  '0x5c427cd9': {
    name: 'UnauthorizedCaller',
    message: 'Unauthorized operation attempted.',
    action: 'Please contact support.',
  },
  '0xb91e5870': {
    name: 'InvalidBridgeId',
    message: 'Invalid bridge configuration.',
    action: 'Please contact support.',
  },
  '0x7a47c9a2': {
    name: 'InvalidChainId',
    message: 'Invalid chain configuration.',
    action: 'Please contact support.',
  },
  '0x3ae6ee0a': {
    name: 'InvalidReporter',
    message: 'Invalid reporter address provided.',
    action: 'Please check the address and try again.',
  },
  '0x9dd854d3': {
    name: 'InvalidMerkleRoot',
    message: 'Invalid Merkle root provided.',
    action: 'Please reselect your transactions and try again.',
  },
  '0xd61c47ce': {
    name: 'InvalidTransactionCount',
    message: 'Transaction count does not match.',
    action: 'Please reselect your transactions and try again.',
  },
  '0x0432f01c': {
    name: 'MerkleRootMismatch',
    message: 'Merkle root does not match the selected transactions.',
    action: 'Your transaction selection may have changed. Please start over.',
  },
  '0xa24a13a6': {
    name: 'ArrayLengthMismatch',
    message: 'Transaction data arrays have mismatched lengths.',
    action: 'Please try again. If the issue persists, contact support.',
  },
  '0xb05e92fa': {
    name: 'InvalidMerkleProof',
    message: 'Merkle proof verification failed.',
    action: 'Please reselect your transactions and try again.',
  },
  '0x5601467a': {
    name: 'InvalidFeeConfig',
    message: 'Invalid fee configuration.',
    action: 'Please contact support.',
  },
  '0xe08eb492': {
    name: 'SpokeRegistry__InvalidTimingConfig',
    message: 'Invalid timing configuration detected.',
    action: 'Please contact support.',
  },
  '0x7a15c36a': {
    name: 'SpokeRegistry__InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0x36a83b56': {
    name: 'SpokeRegistry__SignatureExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again to continue.',
  },
  '0x8baa579f': {
    name: 'SpokeRegistry__InvalidSigner',
    message: 'Signature verification failed.',
    action: 'Ensure you are signing with the wallet you want to register.',
  },
  '0x6e67e4e2': {
    name: 'SpokeRegistry__InvalidForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Switch to your gas wallet to submit this transaction.',
  },
  '0x86f63dce': {
    name: 'SpokeRegistry__ForwarderExpired',
    message: 'Your registration window has expired.',
    action: 'Please start the registration process again from the beginning.',
  },
  '0x9ab3c3ae': {
    name: 'SpokeRegistry__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0xf4d678b8': {
    name: 'SpokeRegistry__InsufficientFee',
    message: 'Insufficient fee for cross-chain registration.',
    action: 'Ensure you have enough ETH for registration and bridge fees.',
  },
  '0x664e4519': {
    name: 'SpokeRegistry__InvalidOwner',
    message: 'Invalid wallet address provided.',
    action: 'Please check the address and try again.',
  },
  '0x0cc5729a': {
    name: 'SpokeRegistry__BridgeFailed',
    message: 'Cross-chain message failed to send.',
    action: 'Please try again. If the issue persists, the bridge may be temporarily unavailable.',
  },
  '0x4554de53': {
    name: 'SpokeTransactionRegistry__InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0xa5ee6714': {
    name: 'SpokeTransactionRegistry__SignatureExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again to continue.',
  },
  '0xed04f3ed': {
    name: 'SpokeTransactionRegistry__InvalidSigner',
    message: 'Signature verification failed.',
    action: 'Ensure you are signing with the correct wallet.',
  },
  '0x1aeaa3f0': {
    name: 'SpokeTransactionRegistry__InvalidForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Switch to your gas wallet to submit this transaction.',
  },
  '0x9d8060a9': {
    name: 'SpokeTransactionRegistry__RegistrationExpired',
    message: 'Your registration window has expired.',
    action: 'Please start the registration process again from the beginning.',
  },
  '0x29f7e570': {
    name: 'SpokeTransactionRegistry__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x19e686fd': {
    name: 'SpokeTransactionRegistry__NoPendingAcknowledgement',
    message: 'No pending acknowledgement found.',
    action: 'Please complete the acknowledgement step first.',
  },
  '0x3cbd2693': {
    name: 'SpokeTransactionRegistry__MerkleRootMismatch',
    message: 'Merkle root does not match the selected transactions.',
    action: 'Your transaction selection may have changed. Please start over.',
  },
  '0x7da842e2': {
    name: 'SpokeTransactionRegistry__ReportedChainIdMismatch',
    message: 'Chain ID mismatch in transaction data.',
    action: 'Please reselect your transactions and try again.',
  },
  '0xbb119f75': {
    name: 'SpokeTransactionRegistry__ArrayLengthMismatch',
    message: 'Transaction data arrays have mismatched lengths.',
    action: 'Please try again. If the issue persists, contact support.',
  },
  '0xa66a0ad1': {
    name: 'SpokeTransactionRegistry__InsufficientFee',
    message: 'Insufficient fee for cross-chain registration.',
    action: 'Ensure you have enough ETH for registration and bridge fees.',
  },
  '0x7577b0b3': {
    name: 'SpokeTransactionRegistry__InvalidReporter',
    message: 'Invalid reporter address provided.',
    action: 'Please check the address and try again.',
  },
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
  '0x719cea76': {
    name: 'Hub__Paused',
    message: 'The registry is currently paused for maintenance.',
    action: 'Please try again later.',
  },
  '0xbf7c72a6': {
    name: 'Hub__InvalidRegistry',
    message: 'Invalid registry configuration.',
    action: 'Please contact support.',
  },
  '0xba85f0bb': {
    name: 'Hub__InsufficientFee',
    message: 'Insufficient fee for this operation.',
    action: 'Please ensure you have enough ETH.',
  },
  '0x066df40f': {
    name: 'Hub__WithdrawalFailed',
    message: 'Fee withdrawal failed.',
    action: 'Please try again.',
  },
  '0x8791d1d6': {
    name: 'Hub__UnauthorizedInbox',
    message: 'Cross-chain message from unauthorized source.',
    action: 'Please contact support.',
  },
  '0xc16752ee': {
    name: 'Hub__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'A valid address is required for this operation.',
  },
  '0x7d60d71c': {
    name: 'CrossChainInbox__UntrustedSource',
    message: 'Cross-chain message from untrusted source.',
    action: 'Please contact support.',
  },
  '0xaea84e78': {
    name: 'CrossChainInbox__OnlyBridge',
    message: 'Only bridge can deliver cross-chain messages.',
    action: 'Please contact support.',
  },
  '0x23e92f31': {
    name: 'CrossChainInbox__InvalidMessage',
    message: 'Invalid cross-chain message received.',
    action: 'Please try again or contact support.',
  },
  '0x6d50853e': {
    name: 'CrossChainInbox__ZeroAddress',
    message: 'Invalid address in cross-chain message.',
    action: 'Please contact support.',
  },
  '0x249d64fe': {
    name: 'CrossChainInbox__SourceChainMismatch',
    message: 'Cross-chain message from unexpected chain.',
    action: 'Please contact support.',
  },
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
  '0x0790c247': {
    name: 'OperatorRegistry__NotAuthorizedForRegistry',
    message: 'Operator not authorized for this registry type.',
    action: 'Contact DAO to request additional capabilities.',
  },
  '0xfa354622': {
    name: 'FraudulentContractRegistry__NotApprovedOperator',
    message: 'Only approved operators can submit fraudulent contracts.',
    action: 'Contact the DAO to become an approved operator.',
  },
  '0x08d23496': {
    name: 'FraudulentContractRegistry__InvalidMerkleRoot',
    message: 'Invalid Merkle root provided.',
    action: 'Please verify your contract data and try again.',
  },
  '0x6c3461c2': {
    name: 'FraudulentContractRegistry__InvalidChainId',
    message: 'Invalid chain ID provided.',
    action: 'Please select a valid chain.',
  },
  '0x282a90eb': {
    name: 'FraudulentContractRegistry__InvalidContractCount',
    message: 'At least one contract address is required.',
    action: 'Add contract addresses to your submission.',
  },
  '0x457236a0': {
    name: 'FraudulentContractRegistry__ArrayLengthMismatch',
    message: 'Contract and chain ID arrays must have the same length.',
    action: 'Ensure each contract has a corresponding chain ID.',
  },
  '0xa94c12fa': {
    name: 'FraudulentContractRegistry__MerkleRootMismatch',
    message: 'Merkle root does not match the provided contracts.',
    action: 'Your submission data may have changed. Please regenerate.',
  },
  '0x722f72d7': {
    name: 'FraudulentContractRegistry__AlreadyRegistered',
    message: 'This batch has already been registered.',
  },
  '0x724bf72c': {
    name: 'FraudulentContractRegistry__InsufficientFee',
    message: 'Insufficient fee for batch registration.',
    action: 'Ensure you have enough ETH for the registration fee.',
  },
  '0x30a734b6': {
    name: 'FraudulentContractRegistry__FeeForwardFailed',
    message: 'Failed to forward fee to registry hub.',
    action: 'Please try again.',
  },
  '0xa58399f9': {
    name: 'FraudulentContractRegistry__BatchNotFound',
    message: 'Batch not found.',
    action: 'Please verify the batch ID and try again.',
  },
  '0xee5affb2': {
    name: 'FraudulentContractRegistry__AlreadyInvalidated',
    message: 'This entry has already been invalidated.',
  },
  '0x022c4b15': {
    name: 'FraudulentContractRegistry__NotInvalidated',
    message: 'This entry is not invalidated.',
    action: 'Only invalidated entries can be reinstated.',
  },
  '0x7020d8c8': {
    name: 'FraudulentContractRegistry__InvalidOperatorRegistry',
    message: 'Invalid operator registry address.',
    action: 'Contact the DAO to verify contract configuration.',
  },
  '0x3e81b8ca': {
    name: 'FraudulentContractRegistry__MissingRegistryHub',
    message: 'Registry hub address not configured.',
    action: 'Contact the DAO to verify contract configuration.',
  },
  '0x54689933': {
    name: 'FraudulentContractRegistry__InvalidContractAddress',
    message: 'Invalid contract address provided.',
    action: 'Ensure the address is a valid Ethereum address.',
  },
  '0x4b2858dd': {
    name: 'FraudulentContractRegistry__InvalidChainIdEntry',
    message: 'Invalid chain ID in entry.',
    action: 'Ensure each entry has a valid chain ID.',
  },
  '0x86eaeab5': {
    name: 'FraudulentContractRegistry__BatchSizeExceedsLimit',
    message: 'Batch size exceeds the maximum allowed.',
    action: 'Split your submission into smaller batches.',
  },
  '0xf53a0b5c': {
    name: 'FraudulentContractRegistry__UnexpectedEthWithFeesDisabled',
    message: 'ETH sent but fees are disabled.',
    action: 'Do not send ETH when fees are disabled.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // V2 Hub + Registries Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x7b8aa786': {
    name: 'FraudRegistryHubV2__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0x463051ce': {
    name: 'FraudRegistryHubV2__OnlyInbox',
    message: 'Only the cross-chain inbox can call this function.',
    action: 'Please contact support.',
  },
  '0xe706f014': {
    name: 'FraudRegistryHubV2__InvalidIdentifierLength',
    message: 'Invalid identifier length.',
    action: 'Please check the identifier and try again.',
  },
  '0x79fc992a': {
    name: 'FraudRegistryHubV2__UnknownRegistryType',
    message: 'Unknown registry type.',
    action: 'Please contact support.',
  },
  '0x6317676b': {
    name: 'FraudRegistryHubV2__WithdrawFailed',
    message: 'Fee withdrawal failed.',
    action: 'Please try again.',
  },
  '0x07d38419': {
    name: 'WalletRegistryV2__AlreadyRegistered',
    message: 'This wallet is already registered.',
    action: 'Search the registry to view its status.',
  },
  '0x2055835e': {
    name: 'WalletRegistryV2__AlreadyAcknowledged',
    message: 'This wallet already has a pending acknowledgement.',
    action: 'Complete the registration or wait for it to expire.',
  },
  '0x9d0170bd': {
    name: 'WalletRegistryV2__NotAcknowledged',
    message: 'No pending acknowledgement found.',
    action: 'Please complete the acknowledgement step first.',
  },
  '0xf5916161': {
    name: 'WalletRegistryV2__DeadlineExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0xe69d38d2': {
    name: 'WalletRegistryV2__DeadlineInPast',
    message: 'Signature deadline is in the past.',
    action: 'Please generate a new signature.',
  },
  '0xb4945575': {
    name: 'WalletRegistryV2__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x68611c32': {
    name: 'WalletRegistryV2__InvalidSignature',
    message: 'Signature verification failed.',
    action: 'Please sign again with the correct wallet.',
  },
  '0xa3f32d50': {
    name: 'WalletRegistryV2__InvalidSigner',
    message: 'Signer does not match the wallet being registered.',
    action: 'Sign with the registeree wallet.',
  },
  '0x7347c19f': {
    name: 'WalletRegistryV2__NotAuthorizedForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Use the wallet that acknowledged the registration.',
  },
  '0x1a5595d9': {
    name: 'WalletRegistryV2__InsufficientFee',
    message: 'Insufficient registration fee.',
    action: 'Please include the required fee.',
  },
  '0x35223e8e': {
    name: 'WalletRegistryV2__ZeroAddress',
    message: 'Invalid wallet address provided.',
    action: 'Please check the address and try again.',
  },
  '0x003b91cb': {
    name: 'WalletRegistryV2__OnlyHub',
    message: 'Only the hub can perform this action.',
    action: 'Please contact support.',
  },
  '0x36e01a5b': {
    name: 'WalletRegistryV2__OnlyOperatorSubmitter',
    message: 'Only the operator submitter can perform this action.',
    action: 'Please contact support.',
  },
  '0x204fb9b9': {
    name: 'WalletRegistryV2__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one item.',
  },
  '0x94a50787': {
    name: 'WalletRegistryV2__ArrayLengthMismatch',
    message: 'Data arrays have mismatched lengths.',
    action: 'Please verify the inputs and try again.',
  },
  '0xc279298b': {
    name: 'TransactionRegistryV2__AlreadyRegistered',
    message: 'This transaction batch is already registered.',
    action: 'Search the registry to view its status.',
  },
  '0x17659821': {
    name: 'TransactionRegistryV2__AlreadyAcknowledged',
    message: 'This transaction batch already has a pending acknowledgement.',
    action: 'Complete the registration or wait for it to expire.',
  },
  '0x57c093b9': {
    name: 'TransactionRegistryV2__NotAcknowledged',
    message: 'No pending acknowledgement found.',
    action: 'Please complete the acknowledgement step first.',
  },
  '0x09cb7eb6': {
    name: 'TransactionRegistryV2__DeadlineExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0x40a02780': {
    name: 'TransactionRegistryV2__DeadlineInPast',
    message: 'Signature deadline is in the past.',
    action: 'Please generate a new signature.',
  },
  '0x260be5b0': {
    name: 'TransactionRegistryV2__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x38bd4206': {
    name: 'TransactionRegistryV2__InvalidSignature',
    message: 'Signature verification failed.',
    action: 'Please sign again with the correct wallet.',
  },
  '0x2eec674d': {
    name: 'TransactionRegistryV2__InvalidSigner',
    message: 'Signer does not match the reporting wallet.',
    action: 'Sign with the reporting wallet.',
  },
  '0xc1caf254': {
    name: 'TransactionRegistryV2__NotAuthorizedForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Use the wallet that acknowledged the registration.',
  },
  '0x800d138f': {
    name: 'TransactionRegistryV2__InsufficientFee',
    message: 'Insufficient registration fee.',
    action: 'Please include the required fee.',
  },
  '0x17e6065b': {
    name: 'TransactionRegistryV2__ZeroAddress',
    message: 'Invalid reporter address provided.',
    action: 'Please check the address and try again.',
  },
  '0x83c11802': {
    name: 'TransactionRegistryV2__OnlyHub',
    message: 'Only the hub can perform this action.',
    action: 'Please contact support.',
  },
  '0x45e73680': {
    name: 'TransactionRegistryV2__OnlyOperatorSubmitter',
    message: 'Only the operator submitter can perform this action.',
    action: 'Please contact support.',
  },
  '0x42c9bec0': {
    name: 'TransactionRegistryV2__EmptyBatch',
    message: 'Transaction batch cannot be empty.',
    action: 'Please add at least one transaction.',
  },
  '0xf7626ca5': {
    name: 'TransactionRegistryV2__ArrayLengthMismatch',
    message: 'Transaction hashes and chain IDs must have the same length.',
    action: 'Please verify the inputs and try again.',
  },
  '0xcaf23a5c': {
    name: 'TransactionRegistryV2__DataHashMismatch',
    message: 'Data hash does not match acknowledgement.',
    action: 'Ensure the transaction list matches what was acknowledged.',
  },
  '0xec906808': {
    name: 'TransactionRegistryV2__InvalidStep',
    message: 'Invalid registration step.',
    action: 'Please restart the registration flow.',
  },
  '0x2b41b959': {
    name: 'TransactionRegistryV2__HubTransferFailed',
    message: 'Failed to transfer registration to the hub.',
    action: 'Please try again or contact support.',
  },
  '0x57185e22': {
    name: 'TransactionRegistryV2__RefundFailed',
    message: 'Failed to refund excess fee.',
    action: 'Please try again or contact support.',
  },
  '0x181fd563': {
    name: 'ContractRegistryV2__AlreadyRegistered',
    message: 'This contract is already registered.',
    action: 'Search the registry to view its status.',
  },
  '0xe35a3d90': {
    name: 'ContractRegistryV2__ZeroAddress',
    message: 'Invalid contract address provided.',
    action: 'Please check the address and try again.',
  },
  '0x75e566b0': {
    name: 'ContractRegistryV2__OnlyOperatorSubmitter',
    message: 'Only the operator submitter can register contracts.',
    action: 'Contact the DAO to become an approved operator.',
  },
  '0x7e211981': {
    name: 'ContractRegistryV2__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one contract.',
  },
  '0x2171219a': {
    name: 'ContractRegistryV2__ArrayLengthMismatch',
    message: 'Contract and chain ID arrays must have the same length.',
    action: 'Ensure each contract has a corresponding chain ID.',
  },
  '0x862624c3': {
    name: 'OperatorSubmitterV2__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0x498aaa04': {
    name: 'OperatorSubmitterV2__NotApprovedOperator',
    message: 'Only approved operators can submit.',
    action: 'Contact the DAO to become an approved operator.',
  },
  '0x84155f3c': {
    name: 'OperatorSubmitterV2__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one item to register.',
  },
  '0x3f7ebde1': {
    name: 'OperatorSubmitterV2__ArrayLengthMismatch',
    message: 'Data arrays have mismatched lengths.',
    action: 'Please verify your batch data and try again.',
  },
  '0x2ae4ced4': {
    name: 'OperatorSubmitterV2__InsufficientFee',
    message: 'Insufficient batch fee.',
    action: 'Please include the required operator batch fee.',
  },
  '0xc12f791a': {
    name: 'OperatorSubmitterV2__FeeForwardFailed',
    message: 'Failed to forward fee.',
    action: 'Please try again.',
  },
  '0xd2e0c1e5': {
    name: 'OperatorSubmitterV2__InvalidFeeConfig',
    message: 'Invalid fee configuration.',
    action: 'Please contact support.',
  },
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
  '0x3f56613b': {
    name: 'CrossChainMessageV2__InvalidMessageType',
    message: 'Invalid cross-chain message type.',
    action: 'Please contact support.',
  },
  '0x4bf3cb4b': {
    name: 'CrossChainMessageV2__UnsupportedVersion',
    message: 'Unsupported cross-chain message version.',
    action: 'Please contact support.',
  },
  '0x49036e73': {
    name: 'CrossChainMessageV2__InvalidMessageLength',
    message: 'Invalid cross-chain message length.',
    action: 'Please contact support.',
  },
  '0x0bc8e29a': {
    name: 'CrossChainMessageV2__BatchSizeMismatch',
    message: 'Cross-chain batch size mismatch.',
    action: 'Please contact support.',
  },
  '0x9705f71a': {
    name: 'CrossChainInboxV2__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0x462ea0ab': {
    name: 'CrossChainInboxV2__OnlyMailbox',
    message: 'Only the mailbox can deliver cross-chain messages.',
    action: 'Please contact support.',
  },
  '0x0e8260da': {
    name: 'CrossChainInboxV2__UntrustedSource',
    message: 'Cross-chain message from untrusted source.',
    action: 'Please contact support.',
  },
  '0xf6407ddf': {
    name: 'CrossChainInboxV2__SourceChainMismatch',
    message: 'Cross-chain source chain mismatch.',
    action: 'Please contact support.',
  },
  '0xb039e7a9': {
    name: 'CrossChainInboxV2__UnknownMessageType',
    message: 'Unknown cross-chain message type.',
    action: 'Please contact support.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // V2 SpokeRegistryV2 Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x8b4b46c4': {
    name: 'SpokeRegistryV2__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
  '0x3d8ff737': {
    name: 'SpokeRegistryV2__InvalidTimingConfig',
    message: 'Invalid timing configuration.',
    action: 'Please contact support.',
  },
  '0xc4069ba2': {
    name: 'SpokeRegistryV2__InvalidOwner',
    message: 'Invalid wallet address provided.',
    action: 'Please check the address and try again.',
  },
  '0x860f06c2': {
    name: 'SpokeRegistryV2__SignatureExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0x58f53864': {
    name: 'SpokeRegistryV2__InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0x3a8e63c6': {
    name: 'SpokeRegistryV2__InvalidSigner',
    message: 'Signature verification failed.',
    action: 'Ensure you signed with the wallet you want to register.',
  },
  '0x2f4c1872': {
    name: 'SpokeRegistryV2__InvalidForwarder',
    message: 'Wrong wallet connected for this registration.',
    action: 'Switch to your gas wallet to submit this transaction.',
  },
  '0xb23325c9': {
    name: 'SpokeRegistryV2__GracePeriodNotStarted',
    message: 'The grace period has not ended yet.',
    action: 'Please wait for the countdown to complete before registering.',
  },
  '0x2fab8da5': {
    name: 'SpokeRegistryV2__ForwarderExpired',
    message: 'Your registration window has expired.',
    action: 'Please start the registration process again from the beginning.',
  },
  '0xc343d197': {
    name: 'SpokeRegistryV2__HubNotConfigured',
    message: 'Hub chain not configured.',
    action: 'Cross-chain registration is not available. Please contact support.',
  },
  '0x9ea3c99b': {
    name: 'SpokeRegistryV2__InsufficientFee',
    message: 'Insufficient fee for cross-chain registration.',
    action: 'Ensure you have enough ETH for registration and bridge fees.',
  },
  '0x99b352da': {
    name: 'SpokeRegistryV2__RefundFailed',
    message: 'Failed to refund excess fee.',
    action: 'Please try again or contact support.',
  },
  '0x141e8e83': {
    name: 'SpokeRegistryV2__WithdrawalFailed',
    message: 'Fee withdrawal failed.',
    action: 'Please try again.',
  },
  '0x16392cf6': {
    name: 'SpokeRegistryV2__InvalidHubConfig',
    message: 'Invalid hub configuration.',
    action: 'Please contact support.',
  },
  '0x339a0ecf': {
    name: 'SpokeRegistryV2__EmptyBatch',
    message: 'Batch cannot be empty.',
    action: 'Please add at least one item to register.',
  },
  '0xaef92cb3': {
    name: 'SpokeRegistryV2__ArrayLengthMismatch',
    message: 'Data arrays have mismatched lengths.',
    action: 'Please try again. If the issue persists, contact support.',
  },
  '0x06cf9d53': {
    name: 'SpokeRegistryV2__InvalidDataHash',
    message: 'Data hash mismatch.',
    action: 'Your data may have changed. Please start over.',
  },
};

/**
 * Map of error selectors (4-byte hex) to user-friendly error info.
 * Normalized to lowercase for case-insensitive lookups.
 */
export const CONTRACT_ERROR_MAP: Record<string, ContractErrorInfo> = Object.fromEntries(
  Object.entries(CONTRACT_ERROR_SELECTORS).map(([selector, info]) => [selector.toLowerCase(), info])
);
