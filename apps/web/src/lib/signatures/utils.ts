/**
 * Signature parsing and validation utilities.
 *
 * Re-exports from shared package for use in web app.
 */

export {
  parseSignature,
  isSignatureExpired,
  isWithinRegistrationWindow,
  getStepName,
  isValidSignatureFormat,
  STEP_NAMES,
  type ParsedSignature,
} from '@swr/signatures';
