import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { sanitizeErrorMessage as baseSanitizeErrorMessage } from '@swr/errors';

// Re-export formatting utilities from shared package
export { formatCentsToUsd, formatEthConsistent, formatFeeLineItem } from '@swr/formatting';

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
  const logError = import.meta.env.DEV
    ? (err: unknown) => console.error('[Error Details]', err)
    : undefined;

  return baseSanitizeErrorMessage(error, logError);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Content Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tooltip content for data hash display in transaction registry.
 *
 * Explains that the data hash links the acknowledgement and registration
 * phases, ensuring the same transactions are used throughout.
 */
export const DATA_HASH_TOOLTIP = `A cryptographic hash of your selected transactions that links the acknowledgement and registration phases. This ensures the same set of transactions is used in both steps, preventing tampering. When registered, each transaction emits a blockchain event that off-ramps, wallets, and other services can monitor.`;

/** @deprecated Use DATA_HASH_TOOLTIP */
export const MERKLE_ROOT_TOOLTIP = DATA_HASH_TOOLTIP;
