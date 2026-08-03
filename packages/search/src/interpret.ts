/**
 * Result interpretation utilities for registry search.
 */

import { registryKindLabel } from './errors';
import type {
  SearchResult,
  WalletSearchResult,
  TransactionSearchResult,
  AddressSearchResult,
  ResultStatus,
  UnverifiedRegistries,
} from './types';

/**
 * Copy for the case where a registry did not answer.
 *
 * Worded to block the reading this whole mechanism exists to prevent: the user must not walk
 * away thinking the identifier was checked and came back clean.
 */
function unverifiedDescription(unverified: UnverifiedRegistries): string {
  const names = unverified.map(registryKindLabel).join(' and ');
  const registryWord = unverified.length > 1 ? 'registries' : 'registry';
  return `The ${names} ${registryWord} could not be checked, so this is NOT a clean result. Try again before relying on it.`;
}

/**
 * Whether a result names any registry that did not answer.
 *
 * Read BEFORE narrowing on `found`, deliberately. The result types now make a negative result
 * with a non-empty `unverified` unrepresentable, so on the `found: false` branch TypeScript
 * knows this is always empty — but these helpers are also reachable from plain JS and from
 * hand-built objects in tests and stories, and the failure direction is asymmetric: treating
 * an unknown as `not-found` is the false clean this package exists to prevent, while treating
 * a genuine not-found as unknown merely tells someone to search again.
 */
function hasUnverified(result: { unverified: UnverifiedRegistries }): boolean {
  return result.unverified.length > 0;
}

/**
 * Get simplified status from a wallet search result.
 *
 * @param result - Wallet search result
 * @returns 'registered' | 'unverified' | 'not-found'
 */
export function getWalletStatus(result: WalletSearchResult): ResultStatus {
  const unverified = hasUnverified(result);
  if (result.found) return 'registered';
  return unverified ? 'unverified' : 'not-found';
}

/**
 * Get simplified status from a transaction search result.
 *
 * @param result - Transaction search result
 * @returns 'registered' | 'unverified' | 'not-found'
 */
export function getTransactionStatus(result: TransactionSearchResult): ResultStatus {
  const unverified = hasUnverified(result);
  if (result.found) return 'registered';
  return unverified ? 'unverified' : 'not-found';
}

/**
 * Get simplified status from an address search result.
 *
 * @param result - Address search result (combined wallet + contract)
 * @returns 'registered' | 'unverified' | 'not-found'
 */
export function getAddressStatus(result: AddressSearchResult): ResultStatus {
  // A registry that never answered cannot contribute a "not in the registry" conclusion.
  const unverified = hasUnverified(result);
  if (result.found) return 'registered';
  return unverified ? 'unverified' : 'not-found';
}

/**
 * Get simplified status from any search result.
 *
 * @param result - Search result (address, transaction, or invalid)
 * @returns 'registered' | 'unverified' | 'not-found'
 */
export function getResultStatus(result: SearchResult): ResultStatus {
  if (result.type === 'invalid') return 'not-found';
  const unverified = hasUnverified(result);
  if (result.found) return 'registered';
  return unverified ? 'unverified' : 'not-found';
}

/**
 * Get human-readable label for wallet status.
 */
export function getWalletStatusLabel(result: WalletSearchResult): string {
  const unverified = hasUnverified(result);
  if (result.found) return 'Stolen Wallet';
  return unverified ? 'Could Not Verify' : 'Not Found';
}

/**
 * Get human-readable label for transaction status.
 */
export function getTransactionStatusLabel(result: TransactionSearchResult): string {
  const unverified = hasUnverified(result);
  if (!result.found) {
    return unverified ? 'Could Not Verify' : 'Not Found';
  }
  const chainCount = result.data?.chains.length ?? 0;
  return chainCount === 1 && !result.data?.chainsTruncated
    ? 'Reported as Fraudulent'
    : `Reported as Fraudulent (${formatChainCount(chainCount, result.data?.chainsTruncated)} chains)`;
}

/**
 * Render a per-chain report count, marking it as a floor when the list was truncated.
 *
 * The count comes from `chains.length`, which is only the whole story when the search drained
 * the cursor. When it did not, "10" reads as complete; "10+" reads as what it is.
 */
function formatChainCount(count: number, truncated: boolean | undefined): string {
  return truncated === true ? `${count}+` : String(count);
}

/**
 * Get human-readable label for combined address result.
 * Shows which registry(ies) the address was found in.
 */
export function getAddressStatusLabel(result: AddressSearchResult): string {
  const unverified = hasUnverified(result);
  if (!result.found) {
    return unverified ? 'Could Not Verify' : 'Not Found';
  }

  const labels: string[] = [];

  if (result.foundInWalletRegistry) {
    labels.push('Stolen Wallet');
  }

  if (result.foundInContractRegistry) {
    labels.push('Fraudulent Contract');
  }

  return labels.join(' & ');
}

/**
 * Get human-readable label for any search result.
 */
export function getStatusLabel(result: SearchResult): string {
  switch (result.type) {
    case 'address':
      return getAddressStatusLabel(result);
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
  const unverified: UnverifiedRegistries = result.unverified;
  if (!result.found) {
    return unverified.length > 0
      ? unverifiedDescription(unverified)
      : 'This wallet is not in the registry.';
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
  const unverified: UnverifiedRegistries = result.unverified;
  if (!result.found) {
    return unverified.length > 0
      ? unverifiedDescription(unverified)
      : 'This transaction is not in the registry.';
  }
  const chainCount = result.data?.chains.length ?? 0;
  const truncated = result.data?.chainsTruncated;
  return chainCount === 1 && !truncated
    ? 'This transaction has been reported as fraudulent.'
    : `This transaction has been reported as fraudulent on ${formatChainCount(chainCount, truncated)} chain${chainCount > 1 || truncated ? 's' : ''}.`;
}

/**
 * Get description for combined address result.
 * Describes findings from both wallet and contract registries.
 */
export function getAddressStatusDescription(result: AddressSearchResult): string {
  const unverified: UnverifiedRegistries = result.unverified;
  if (!result.found) {
    return unverified.length > 0
      ? unverifiedDescription(unverified)
      : 'This address is not in any registry.';
  }

  const descriptions: string[] = [];

  // State the gap first: a hit in one registry must not imply the other was checked.
  if (unverified.length > 0) {
    descriptions.push(unverifiedDescription(unverified));
  }

  if (result.foundInWalletRegistry) {
    const walletData = result.data?.wallet;
    if (walletData?.isSponsored) {
      descriptions.push('Registered as a stolen wallet (sponsored registration).');
    } else {
      descriptions.push('Registered as a stolen wallet.');
    }
  }

  if (result.foundInContractRegistry) {
    const contractData = result.data?.contract;
    const chainCount = contractData?.chains.length ?? 0;
    const truncated = contractData?.chainsTruncated;
    if (chainCount === 1 && !truncated) {
      descriptions.push('Flagged as a fraudulent contract.');
    } else {
      descriptions.push(
        `Flagged as a fraudulent contract on ${formatChainCount(chainCount, truncated)} chains.`
      );
    }
  }

  return descriptions.join(' ');
}

/**
 * Get description for any search result.
 */
export function getStatusDescription(result: SearchResult): string {
  switch (result.type) {
    case 'address':
      return getAddressStatusDescription(result);
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
