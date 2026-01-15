/**
 * Contract custom error selectors mapped to user-friendly messages.
 *
 * When adding new errors to smart contracts:
 * 1. Define error in Solidity: `error MyContract__ErrorName();`
 * 2. Compute selector: `cast sig 'MyContract__ErrorName()'`
 * 3. Add entry to CONTRACT_ERROR_MAP below
 * 4. Write clear, actionable message for users
 *
 * @see CLAUDE.md "Error Handling: Contract → Frontend" section
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
 * Map of error selectors (4-byte hex) to user-friendly error info.
 *
 * Selectors computed via: `cast sig 'ErrorName()'`
 */
export const CONTRACT_ERROR_MAP: Record<string, ContractErrorInfo> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // IStolenWalletRegistry errors (16)
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // ISpokeRegistry errors (10)
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // IBridgeAdapter errors (3)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // IFeeManager errors (4)
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
  // IRegistryHub errors (5)
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // ICrossChainInbox errors (5)
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Soulbound Token errors (12)
  // ═══════════════════════════════════════════════════════════════════════════

  // BaseSoulbound errors
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

  // WalletSoulbound errors
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

  // SupportSoulbound errors
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

  // TranslationRegistry errors
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
};

/**
 * Decode a contract custom error from an error message containing a hex selector.
 *
 * Extracts the 4-byte selector from patterns like "custom error 0xec5c97a6"
 * and returns a user-friendly message if the error is recognized.
 *
 * @param errorMessage - The raw error message from viem/wagmi
 * @returns User-friendly error message, or null if not a recognized contract error
 *
 * @example
 * ```ts
 * const friendly = decodeContractError('Execution reverted: custom error 0xec5c97a6');
 * // Returns: "Your registration window has expired. Please start the registration process again from the beginning."
 * ```
 */
export function decodeContractError(errorMessage: string): string | null {
  // Match "custom error 0x" followed by 8 hex characters (4 bytes)
  const selectorMatch = errorMessage.match(/custom error (0x[a-fA-F0-9]{8})/i);
  if (!selectorMatch) return null;

  const selector = selectorMatch[1].toLowerCase();
  const errorInfo = CONTRACT_ERROR_MAP[selector];

  if (!errorInfo) {
    // Unknown contract error - return null to fall through to generic handling
    return null;
  }

  // Combine message and action into a single user-friendly string
  return errorInfo.action ? `${errorInfo.message} ${errorInfo.action}` : errorInfo.message;
}

/**
 * Get detailed error info for a known contract error selector.
 *
 * @param selector - The 4-byte hex selector (e.g., "0xec5c97a6")
 * @returns Error info object or undefined if not recognized
 */
export function getContractErrorInfo(selector: string): ContractErrorInfo | undefined {
  return CONTRACT_ERROR_MAP[selector.toLowerCase()];
}
