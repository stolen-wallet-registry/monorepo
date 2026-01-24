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
 * Tooltip content for Merkle root display in transaction registry.
 *
 * Explains what the merkle root is, how it can be verified, and that
 * transactions emit events for external services to monitor.
 */
export const MERKLE_ROOT_TOOLTIP = `A cryptographic fingerprint of your selected transactions, stored on-chain as tamper-proof evidence. This root can be verified against the original transaction hashes using Merkle proofs, enabling anyone to confirm exactly which transactions you reported. When registered, each transaction emits a blockchain event that off-ramps, wallets, and other services can monitor to identify potentially stolen funds.`;
