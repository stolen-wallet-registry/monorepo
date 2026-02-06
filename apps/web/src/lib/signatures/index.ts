// Signature utilities barrel export

// V1 exports (deprecated)
export {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  EIP712_TYPES,
  TYPE_HASHES,
  SIGNATURE_STEP,
  STATEMENTS,
  getEIP712Domain,
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type SignatureStep,
} from './eip712';

// V2 exports (primary)
export {
  V2_EIP712_DOMAIN_NAME,
  V2_EIP712_DOMAIN_VERSION,
  SPOKE_V2_EIP712_DOMAIN_NAME,
  V2_EIP712_TYPES,
  V2_STATEMENTS,
  getV2EIP712Domain,
  getSpokeV2EIP712Domain,
  buildV2AcknowledgementTypedData,
  buildV2RegistrationTypedData,
  type V2AcknowledgementMessage,
  type V2RegistrationMessage,
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
