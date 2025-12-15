/**
 * Zod schemas barrel export.
 *
 * Centralized validation schemas for type-safe form and data validation.
 */

// Address schemas
export {
  ethereumAddressSchema,
  optionalEthereumAddressSchema,
  type EthereumAddress,
} from './address';

// Signature schemas
export {
  hexStringSchema,
  signatureSchema,
  txHashSchema,
  type Signature,
  type TxHash,
} from './signature';

// Registration form schemas
export {
  initialFormSchema,
  selfRelayFormSchema,
  type InitialFormInput,
  type InitialFormValues,
  type SelfRelayFormValues,
} from './registration';
