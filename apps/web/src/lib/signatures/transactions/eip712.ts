// EIP-712 typed data definitions for transaction registry
// Re-exports from shared package for use in web app

export {
  TX_EIP712_TYPES,
  TX_SIGNATURE_STEP,
  STATEMENTS,
  getEIP712Domain,
  getSpokeEIP712Domain,
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  computeTransactionDataHash,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type TxSignatureStep,
} from '@swr/signatures';
