import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BaseError } from 'viem';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize error messages for user display.
 *
 * Logs full error details to console in development for debugging,
 * then returns a user-friendly message for UI display.
 */
export function sanitizeErrorMessage(error: unknown): string {
  // Log full error in development for debugging
  if (import.meta.env.DEV) {
    console.error('[Error Details]', error);
  }

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

  // Clean up any double spaces or trailing punctuation issues
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // If we stripped everything meaningful or got useless output like [object Object], provide a generic message
  if (!sanitized || sanitized.length < 10 || /^\[object .+\]$/.test(sanitized)) {
    return 'An unexpected error occurred. Please try again.';
  }

  return sanitized;
}
