// EIP-712 typed data definitions for StolenWalletRegistry
// Re-exports from shared package for use in web app

// ═══════════════════════════════════════════════════════════════════════════
// V1 EXPORTS (DEPRECATED - kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Domain configuration
  /** @deprecated Use V2_EIP712_DOMAIN_NAME for new integrations */
  EIP712_DOMAIN_NAME,
  /** @deprecated Use V2_EIP712_DOMAIN_VERSION for new integrations */
  EIP712_DOMAIN_VERSION,
  /** @deprecated Use getV2EIP712Domain for new integrations */
  getEIP712Domain,
  // Type definitions
  /** @deprecated V1 type hashes - V2 uses different typed data structure */
  TYPE_HASHES,
  /** @deprecated Use V2_EIP712_TYPES for new integrations */
  EIP712_TYPES,
  // Step constants (shared by V1 and V2 - not deprecated)
  SIGNATURE_STEP,
  type SignatureStep,
  // Statement constants
  /** @deprecated Use V2_STATEMENTS for new integrations */
  STATEMENTS,
  // Types
  /** @deprecated Use V2AcknowledgementMessage for new integrations */
  type AcknowledgementMessage,
  /** @deprecated Use V2RegistrationMessage for new integrations */
  type RegistrationMessage,
  // Builders
  /** @deprecated Use buildV2AcknowledgementTypedData for new integrations */
  buildAcknowledgementTypedData,
  /** @deprecated Use buildV2RegistrationTypedData for new integrations */
  buildRegistrationTypedData,
} from '@swr/signatures';

// ═══════════════════════════════════════════════════════════════════════════
// V2 EXPORTS (PRIMARY)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // V2 Domain configuration
  V2_EIP712_DOMAIN_NAME,
  V2_EIP712_DOMAIN_VERSION,
  SPOKE_V2_EIP712_DOMAIN_NAME,
  getV2EIP712Domain,
  getSpokeV2EIP712Domain,
  // V2 Type definitions
  V2_EIP712_TYPES,
  V2_STATEMENTS,
  // V2 Types
  type V2AcknowledgementMessage,
  type V2RegistrationMessage,
  type WalletRegistrationArgs,
  // V2 Builders
  buildV2AcknowledgementTypedData,
  buildV2RegistrationTypedData,
} from '@swr/signatures';
