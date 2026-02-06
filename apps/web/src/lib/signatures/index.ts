// Signature utilities barrel export

export {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_TYPES,
  SIGNATURE_STEP,
  STATEMENTS,
  getEIP712Domain,
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type SignatureStep,
  type WalletAcknowledgeArgs,
  type WalletRegistrationArgs,
} from './eip712';

export {
  SIGNATURE_TTL_MS,
  storeSignature,
  getSignature,
  removeSignature,
  clearSignatures,
  clearAllSignatures,
  type StoredSignature,
} from './storage';

export {
  parseSignature,
  isSignatureExpired,
  isWithinRegistrationWindow,
  getStepName,
  isValidSignatureFormat,
  STEP_NAMES,
  type ParsedSignature,
} from './utils';
