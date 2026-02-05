// EIP-712 typed data definitions for transaction registry
// Re-exports from shared package for use in web app

// V1 exports (deprecated)
export {
  TX_EIP712_DOMAIN_NAME,
  TX_EIP712_DOMAIN_VERSION,
  getTxEIP712Domain,
  TX_EIP712_TYPES,
  TX_SIGNATURE_STEP,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type TxSignatureStep,
  /** @deprecated Use buildV2TxAcknowledgementTypedData */
  buildTxAcknowledgementTypedData,
  /** @deprecated Use buildV2TxRegistrationTypedData */
  buildTxRegistrationTypedData,
} from '@swr/signatures';

// V2 exports (primary)
export {
  V2_TX_EIP712_TYPES,
  V2_STATEMENTS,
  getV2EIP712Domain,
  getSpokeV2EIP712Domain,
  buildV2TxAcknowledgementTypedData,
  buildV2TxRegistrationTypedData,
  computeTransactionDataHash,
  type V2TxAcknowledgementMessage,
  type V2TxRegistrationMessage,
} from '@swr/signatures';
