// EIP-712 typed data definitions for StolenWalletRegistry
// Re-exports from shared package for use in web app

export {
  // Domain configuration
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  getEIP712Domain,
  // Type definitions
  EIP712_TYPES,
  STATEMENTS,
  // Step constants
  SIGNATURE_STEP,
  type SignatureStep,
  // Types
  type AcknowledgementMessage,
  type RegistrationMessage,
  type WalletAcknowledgeArgs,
  type WalletRegistrationArgs,
  // Builders
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
} from '@swr/signatures';
