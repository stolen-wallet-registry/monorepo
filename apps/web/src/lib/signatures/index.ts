// Signature utilities barrel export

export {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_TYPES,
  TYPE_HASHES,
  SIGNATURE_STEP,
  getEIP712Domain,
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type SignatureStep,
} from './eip712';

export {
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
