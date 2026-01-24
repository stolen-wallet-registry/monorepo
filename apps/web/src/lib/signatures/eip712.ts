// EIP-712 typed data definitions for StolenWalletRegistry
// Re-exports from shared package for use in web app

export {
  // Domain configuration
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  getEIP712Domain,
  // Type definitions
  TYPE_HASHES,
  EIP712_TYPES,
  SIGNATURE_STEP,
  // Statement constants
  STATEMENTS,
  // Types
  type AcknowledgementMessage,
  type RegistrationMessage,
  type SignatureStep,
  // Builders
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
} from '@swr/signatures';
