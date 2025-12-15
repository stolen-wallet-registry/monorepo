/**
 * Error handling utilities.
 *
 * Provides standardized error handling patterns for form and signature operations.
 */

import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import type { SignatureStatus } from '@/components/composed/SignatureCard';

/**
 * Creates a standardized error handler for signature operations.
 *
 * @param setError - Function to set error message state
 * @param setStatus - Function to set signature status state
 * @param category - Logger category for the operation
 * @returns Error handler function
 *
 * @example
 * const handleError = createSignatureErrorHandler(setSignatureError, setSignatureStatus, 'acknowledgement');
 * try {
 *   await signMessage();
 * } catch (err) {
 *   handleError(err, 'signing acknowledgement');
 * }
 */
export function createSignatureErrorHandler(
  setError: (msg: string | null) => void,
  setStatus: (status: SignatureStatus) => void,
  category: 'acknowledgement' | 'registration' = 'acknowledgement'
) {
  return (error: unknown, context?: string) => {
    const errorMessage = sanitizeErrorMessage(error);
    const logContext = context ? `${category} ${context}` : category;

    logger.signature.error(
      `${logContext} failed`,
      { error: errorMessage },
      error instanceof Error ? error : undefined
    );

    setError(errorMessage);
    setStatus('error');
  };
}

/**
 * Creates an error handler for general form operations.
 *
 * @param setError - Function to set error message state
 * @returns Error handler function
 *
 * @example
 * const handleError = createFormErrorHandler(setFormError);
 * try {
 *   await submitForm();
 * } catch (err) {
 *   handleError(err, 'form submission');
 * }
 */
export function createFormErrorHandler(setError: (msg: string | null) => void) {
  return (error: unknown, context?: string) => {
    const errorMessage = sanitizeErrorMessage(error);

    logger.registration.error(
      `${context ?? 'Form operation'} failed`,
      { error: errorMessage },
      error instanceof Error ? error : undefined
    );

    setError(errorMessage);
  };
}

/**
 * Common error messages for signature operations.
 */
export const SIGNATURE_ERRORS = {
  MISSING_DATA: 'Missing required data for signing',
  HASH_STRUCT_FAILED: 'Failed to load signing data. Please try again.',
  USER_REJECTED: 'Signature request was rejected',
  EXPIRED: 'Signature has expired. Please sign again.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
} as const;

/**
 * Common error messages for contract operations.
 */
export const CONTRACT_ERRORS = {
  NOT_CONNECTED: 'Please connect your wallet to continue',
  WRONG_NETWORK: 'Please switch to the correct network',
  CONTRACT_NOT_FOUND: 'Contract not found on this network',
  TRANSACTION_FAILED: 'Transaction failed. Please try again.',
} as const;
