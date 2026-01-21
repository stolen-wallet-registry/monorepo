/**
 * Result interpretation utilities for registry search.
 */

import type {
  SearchResult,
  WalletSearchResult,
  TransactionSearchResult,
  ResultStatus,
} from './types';

/**
 * Get simplified status from a wallet search result.
 *
 * @param result - Wallet search result
 * @returns 'registered' | 'not-found'
 */
export function getWalletStatus(result: WalletSearchResult): ResultStatus {
  return result.found ? 'registered' : 'not-found';
}

/**
 * Get simplified status from a transaction search result.
 *
 * @param result - Transaction search result
 * @returns 'registered' | 'not-found'
 */
export function getTransactionStatus(result: TransactionSearchResult): ResultStatus {
  return result.found ? 'registered' : 'not-found';
}

/**
 * Get simplified status from any search result.
 *
 * @param result - Search result (wallet, transaction, or invalid)
 * @returns 'registered' | 'not-found'
 */
export function getResultStatus(result: SearchResult): ResultStatus {
  if (result.type === 'invalid') return 'not-found';
  return result.found ? 'registered' : 'not-found';
}

/**
 * Get human-readable label for wallet status.
 */
export function getWalletStatusLabel(result: WalletSearchResult): string {
  return result.found ? 'Stolen Wallet' : 'Not Found';
}

/**
 * Get human-readable label for transaction status.
 */
export function getTransactionStatusLabel(result: TransactionSearchResult): string {
  if (!result.found) return 'Not Found';
  const chainCount = result.data?.chains.length ?? 0;
  return chainCount === 1
    ? 'Reported as Fraudulent'
    : `Reported as Fraudulent (${chainCount} chains)`;
}

/**
 * Get human-readable label for any search result.
 */
export function getStatusLabel(result: SearchResult): string {
  switch (result.type) {
    case 'wallet':
      return getWalletStatusLabel(result);
    case 'transaction':
      return getTransactionStatusLabel(result);
    case 'invalid':
      return 'Invalid Input';
  }
}

/**
 * Get description for wallet status.
 */
export function getWalletStatusDescription(result: WalletSearchResult): string {
  if (!result.found) {
    return 'This wallet is not in the registry.';
  }
  if (result.data?.isSponsored) {
    return 'This wallet has been registered as stolen (sponsored registration).';
  }
  return 'This wallet has been registered as stolen.';
}

/**
 * Get description for transaction status.
 */
export function getTransactionStatusDescription(result: TransactionSearchResult): string {
  if (!result.found) {
    return 'This transaction is not in the registry.';
  }
  const chainCount = result.data?.chains.length ?? 0;
  return chainCount === 1
    ? 'This transaction has been reported as fraudulent.'
    : `This transaction has been reported as fraudulent on ${chainCount} chain${chainCount > 1 ? 's' : ''}.`;
}

/**
 * Get description for any search result.
 */
export function getStatusDescription(result: SearchResult): string {
  switch (result.type) {
    case 'wallet':
      return getWalletStatusDescription(result);
    case 'transaction':
      return getTransactionStatusDescription(result);
    case 'invalid':
      return 'Please enter a valid wallet address or transaction hash.';
  }
}

/**
 * Check if a search result indicates the item is compromised/reported.
 */
export function isCompromised(result: SearchResult): boolean {
  return result.type !== 'invalid' && result.found;
}

/**
 * Format a timestamp (bigint) as a human-readable date.
 *
 * @param timestamp - Unix timestamp in seconds (as bigint)
 * @param options - Intl.DateTimeFormat options
 */
export function formatTimestamp(timestamp: bigint, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString(
    undefined,
    options ?? {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  );
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago").
 *
 * @param timestamp - Unix timestamp in seconds (as bigint)
 */
export function formatRelativeTime(timestamp: bigint): string {
  const now = Date.now();
  const then = Number(timestamp) * 1000;
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/**
 * Truncate an address or hash for display.
 *
 * @param value - Address or hash to truncate
 * @param startChars - Characters to keep at start (default 6)
 * @param endChars - Characters to keep at end (default 4)
 */
export function truncateHash(value: string, startChars = 6, endChars = 4): string {
  if (value.length <= startChars + endChars + 3) return value;
  return `${value.slice(0, startChars)}...${value.slice(-endChars)}`;
}
