// Transaction batch signature utilities barrel export

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

export {
  TX_SIGNATURE_TTL_MS,
  storeTxSignature,
  getTxSignature,
  removeTxSignature,
  clearTxSignatures,
  clearAllTxSignatures,
  type StoredTxSignature,
} from './storage';
