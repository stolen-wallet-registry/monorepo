// EIP-712 typed data definitions for StolenTransactionRegistry
// Re-exports from shared package for use in web app

export {
  // Domain configuration
  TX_EIP712_DOMAIN_NAME,
  TX_EIP712_DOMAIN_VERSION,
  getTxEIP712Domain,
  // Type definitions
  TX_EIP712_TYPES,
  TX_SIGNATURE_STEP,
  // Types
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type TxSignatureStep,
  // Builders
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
} from '@swr/signatures';
