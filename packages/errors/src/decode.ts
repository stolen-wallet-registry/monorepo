/**
 * Contract error decoding utilities.
 */

import { BaseError } from 'viem';
import { CONTRACT_ERROR_MAP, type ContractErrorInfo } from './selectors';

/**
 * Decode a contract custom error from an error message containing a hex selector.
 *
 * Extracts the 4-byte selector from patterns like "custom error 0xec5c97a6"
 * and returns a user-friendly message if the error is recognized.
 *
 * @param errorMessage - The raw error message from viem/wagmi
 * @returns User-friendly error message, or null if not a recognized contract error
 *
 * @example
 * ```ts
 * const friendly = decodeContractError('Execution reverted: custom error 0xec5c97a6');
 * // Returns: "Your registration window has expired. Please start the registration process again from the beginning."
 * ```
 */
export function decodeContractError(errorMessage: string): string | null {
  // Match "custom error 0x" followed by 8 hex characters (4 bytes)
  const selectorMatch = errorMessage.match(/custom error (0x[a-fA-F0-9]{8})/i);
  if (!selectorMatch) return null;

  const selector = selectorMatch[1].toLowerCase();
  const errorInfo = CONTRACT_ERROR_MAP[selector];

  if (!errorInfo) {
    // Unknown contract error - return null to fall through to generic handling
    return null;
  }

  // Combine message and action into a single user-friendly string
  return errorInfo.action ? `${errorInfo.message} ${errorInfo.action}` : errorInfo.message;
}

/**
 * Get detailed error info for a known contract error selector.
 *
 * @param selector - The 4-byte hex selector (e.g., "0xec5c97a6")
 * @returns Error info object or undefined if not recognized
 */
export function getContractErrorInfo(selector: string): ContractErrorInfo | undefined {
  return CONTRACT_ERROR_MAP[selector.toLowerCase()];
}

/**
 * Sanitize error messages for user display.
 *
 * Handles known viem error types, contract custom errors, and strips
 * technical details from generic error messages.
 *
 * @param error - The error to sanitize (can be any type)
 * @param logError - Optional callback to log the original error (for debugging)
 * @returns User-friendly error message
 */
export function sanitizeErrorMessage(error: unknown, logError?: (error: unknown) => void): string {
  // Allow caller to handle logging (e.g., console.error in dev)
  logError?.(error);

  // Check for known viem error types
  if (error instanceof BaseError) {
    switch (error.name) {
      case 'UserRejectedRequestError':
        return 'Transaction was cancelled. Please try again when ready.';
      case 'InsufficientFundsError':
        return 'Insufficient funds to complete this transaction.';
      case 'NonceTooLowError':
        return 'Transaction conflict detected. Please refresh and try again.';
      case 'HttpRequestError':
      case 'TimeoutError':
        return 'Network error. Please check your connection and try again.';
    }
  }

  // Fallback to message-based detection
  const message = error instanceof Error ? error.message : String(error);

  // Try to decode contract custom errors (e.g., "custom error 0xec5c97a6")
  const decodedError = decodeContractError(message);
  if (decodedError) {
    return decodedError;
  }

  if (message.includes('User rejected') || message.includes('user rejected')) {
    return 'Transaction was cancelled. Please try again when ready.';
  }

  if (message.includes('insufficient funds')) {
    return 'Insufficient funds to complete this transaction.';
  }

  if (message.includes('nonce too low')) {
    return 'Transaction conflict detected. Please refresh and try again.';
  }

  if (message.includes('network') || message.includes('Network')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Strip version info (e.g., "Version: viem@2.41.2")
  let sanitized = message.replace(/\s*Version:\s*\S+/gi, '');

  // Strip "Details: " prefix if the details just repeat the message
  sanitized = sanitized.replace(/\s*Details:\s*[^.]+\./gi, '');

  // Strip "Raw Call Arguments:" section (contains long hex data that breaks UI)
  sanitized = sanitized.replace(/\s*Raw Call Arguments:[\s\S]*$/i, '');

  // Clean up any double spaces or trailing punctuation issues
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // If we stripped everything meaningful or got useless output like [object Object], provide a generic message
  if (!sanitized || sanitized.length < 10 || /^\[object .+\]$/.test(sanitized)) {
    return 'An unexpected error occurred. Please try again.';
  }

  return sanitized;
}
