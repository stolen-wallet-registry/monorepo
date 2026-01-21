/**
 * @swr/search - Registry search utilities for the Stolen Wallet Registry.
 *
 * Provides framework-agnostic search functions for querying the Ponder indexer.
 * Supports wallet addresses, transaction hashes, and CAIP-10 identifiers.
 *
 * @example
 * ```ts
 * import { search, getStatusLabel, isCompromised } from '@swr/search';
 *
 * const config = { indexerUrl: 'http://localhost:42069' };
 * const result = await search(config, '0x742d35Cc...');
 *
 * console.log(getStatusLabel(result)); // "Stolen Wallet" or "Not Found"
 * console.log(isCompromised(result));  // true or false
 * ```
 */

// Types
export type {
  // Primitives
  Address,
  Hash,
  // Search types
  SearchType,
  SearchConfig,
  SearchResult,
  // Wallet
  WalletSearchData,
  WalletSearchResult,
  // Transaction
  TransactionChainReport,
  TransactionSearchData,
  TransactionSearchResult,
  // Invalid
  InvalidSearchResult,
  // Status
  ResultStatus,
} from './types';

// Detection utilities
export { detectSearchType, isAddress, isTransactionHash, isCAIP10, parseCAIP10 } from './detect';

// Core search functions
export { search, searchWallet, searchWalletByCAIP10, searchTransaction } from './search';

// Interpretation utilities
export {
  getResultStatus,
  getWalletStatus,
  getTransactionStatus,
  getStatusLabel,
  getWalletStatusLabel,
  getTransactionStatusLabel,
  getStatusDescription,
  getWalletStatusDescription,
  getTransactionStatusDescription,
  isCompromised,
  formatTimestamp,
  formatRelativeTime,
  truncateHash,
} from './interpret';

// GraphQL queries (for advanced usage)
export { WALLET_QUERY, WALLET_BY_CAIP10_QUERY, TRANSACTION_QUERY } from './queries';
