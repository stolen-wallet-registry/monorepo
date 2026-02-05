// Transaction batch signature utilities barrel export

// V1 exports (deprecated)
export {
  TX_EIP712_DOMAIN_NAME,
  TX_EIP712_DOMAIN_VERSION,
  TX_EIP712_TYPES,
  TX_SIGNATURE_STEP,
  getTxEIP712Domain,
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type TxSignatureStep,
} from './eip712';

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
} from './eip712';

export {
  TX_SIGNATURE_TTL_MS,
  storeTxSignature,
  getTxSignature,
  removeTxSignature,
  clearTxSignatures,
  clearAllTxSignatures,
  type StoredTxSignature,
} from './storage';
