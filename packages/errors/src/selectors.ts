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
  // V2 FraudRegistryV2 Errors
  // ═══════════════════════════════════════════════════════════════════════════

  '0x8da9134f': {
    name: 'FraudRegistryV2__InvalidWallet',
    message: 'Invalid wallet address.',
    action: 'Please provide a valid wallet address.',
  },
  '0x0b9a6b1e': {
    name: 'FraudRegistryV2__InvalidNonce',
    message: 'Transaction nonce mismatch.',
    action: 'Please refresh the page and try again.',
  },
  '0x9a93003b': {
    name: 'FraudRegistryV2__SignatureExpired',
    message: 'Your signature has expired.',
    action: 'Please sign again.',
  },
  '0xe08f08da': {
    name: 'FraudRegistryV2__InvalidSignature',
    message: 'Signature verification failed.',
    action: 'Ensure you signed with the correct wallet.',
  },
  '0x6a90152c': {
    name: 'FraudRegistryV2__InvalidForwarder',
    message: 'Incorrect forwarder address.',
    action: 'The wallet that acknowledged must complete registration.',
  },
  '0x5943bd3a': {
    name: 'FraudRegistryV2__GracePeriodNotStarted',
    message: 'Grace period has not started.',
    action: 'Please wait before completing registration.',
  },
  '0xeb52e0d8': {
    name: 'FraudRegistryV2__RegistrationExpired',
    message: 'Registration window has expired.',
    action: 'Please start the registration process again.',
  },
  '0x7a55def3': {
    name: 'FraudRegistryV2__AlreadyRegistered',
    message: 'This wallet is already registered.',
    action: 'Search the registry to view its status.',
  },
  '0x8413bb5e': {
    name: 'FraudRegistryV2__InvalidTimingConfig',
    message: 'Invalid timing configuration.',
    action: 'Please contact support.',
  },
  '0x1b4ad0af': {
    name: 'FraudRegistryV2__InvalidFeeConfig',
    message: 'Invalid fee configuration.',
    action: 'Please contact support.',
  },
  '0x098d5513': {
    name: 'FraudRegistryV2__InsufficientFee',
    message: 'Insufficient registration fee.',
    action: 'Please include the required fee.',
  },
  '0x26b22fae': {
    name: 'FraudRegistryV2__FeeForwardFailed',
    message: 'Failed to forward registration fee.',
    action: 'Please try again.',
  },
  '0xf13cde92': {
    name: 'FraudRegistryV2__ExcessRefundFailed',
    message: 'Failed to refund excess fee.',
    action: 'Please try again or contact support.',
  },
  '0x5a2138cd': {
    name: 'FraudRegistryV2__InvalidCaip10Format',
    message: 'Invalid CAIP-10 address format.',
    action: 'Please provide a valid multi-chain address.',
  },
  '0xf07e98e5': {
    name: 'FraudRegistryV2__UnsupportedNamespace',
    message: 'Unsupported chain namespace.',
    action: 'Currently only EVM chains are supported for individual registration.',
  },
  '0xda5251ea': {
    name: 'FraudRegistryV2__UnauthorizedInbox',
    message: 'Unauthorized cross-chain inbox.',
    action: 'Please contact support.',
  },
  '0xca473a10': {
    name: 'FraudRegistryV2__UnauthorizedOperatorSubmitter',
    message: 'Unauthorized operator submitter.',
    action: 'Please contact support.',
  },
  '0x38873585': {
    name: 'FraudRegistryV2__InvalidReporter',
    message: 'Invalid reporter address.',
    action: 'Please provide a valid reporter address.',
  },
  '0x5193e2ce': {
    name: 'FraudRegistryV2__InvalidDataHash',
    message: 'Invalid data hash.',
    action: 'Data hash cannot be zero.',
  },
  '0x9752da41': {
    name: 'FraudRegistryV2__DataHashMismatch',
    message: 'Data hash does not match acknowledgement.',
    action: 'Ensure transaction hashes match what was acknowledged.',
  },
  '0x722d6e98': {
    name: 'FraudRegistryV2__EmptyBatch',
    message: 'Transaction batch cannot be empty.',
    action: 'Provide at least one transaction to register.',
  },
  '0x93a43782': {
    name: 'FraudRegistryV2__ArrayLengthMismatch',
    message: 'Array lengths do not match.',
    action: 'Ensure transaction hashes and chain IDs have the same length.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // V2 OperatorSubmitter Errors
  // ═══════════════════════════════════════════════════════════════════════════

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
  '0x732a9f9b': {
    name: 'OperatorSubmitter__RegistryPaused',
    message: 'The registry is currently paused.',
    action: 'Please try again later.',
  },
  '0x0079d758': {
    name: 'OperatorSubmitter__InvalidFeeConfig',
    message: 'Invalid fee configuration.',
    action: 'Please contact support.',
  },
  '0x13664080': {
    name: 'OperatorSubmitter__ZeroAddress',
    message: 'Invalid address provided.',
    action: 'Please provide a valid address.',
  },
};

/**
 * Map of error selectors (4-byte hex) to user-friendly error info.
 * Normalized to lowercase for case-insensitive lookups.
 */
export const CONTRACT_ERROR_MAP: Record<string, ContractErrorInfo> = Object.fromEntries(
  Object.entries(CONTRACT_ERROR_SELECTORS).map(([selector, info]) => [selector.toLowerCase(), info])
);
