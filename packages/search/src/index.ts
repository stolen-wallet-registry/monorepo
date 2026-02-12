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
  // Address (combined wallet + contract)
  AddressSearchData,
  AddressSearchResult,
  // Wallet (for internal use / backward compat)
  WalletSearchData,
  WalletSearchResult,
  // Contract (for internal use)
  ContractChainReport,
  ContractSearchData,
  // Transaction
  TransactionChainReport,
  TransactionSearchData,
  TransactionSearchResult,
  // Operator
  OperatorData,
  // Invalid
  InvalidSearchResult,
  // Status
  ResultStatus,
} from './types';

// Detection utilities
export { detectSearchType, isAddress, isTransactionHash, isCAIP10, parseCAIP10 } from './detect';

// Core search functions
export {
  search,
  searchAddress,
  searchWallet,
  searchWalletByCAIP10,
  searchTransaction,
  searchContract,
  getOperator,
  listOperators,
} from './search';

// Interpretation utilities
export {
  getResultStatus,
  getWalletStatus,
  getTransactionStatus,
  getAddressStatus,
  getStatusLabel,
  getWalletStatusLabel,
  getTransactionStatusLabel,
  getAddressStatusLabel,
  getStatusDescription,
  getWalletStatusDescription,
  getTransactionStatusDescription,
  getAddressStatusDescription,
  isCompromised,
  formatTimestamp,
  formatRelativeTime,
  truncateHash,
} from './interpret';

// GraphQL queries (for advanced usage)
export {
  WALLET_QUERY,
  WALLET_BY_CAIP10_QUERY,
  TRANSACTION_QUERY,
  CONTRACT_QUERY,
  OPERATOR_QUERY,
  OPERATORS_LIST_QUERY,
  // Dashboard queries
  REGISTRY_STATS_QUERY,
  RECENT_WALLETS_QUERY,
  RECENT_CONTRACTS_QUERY,
  RECENT_TRANSACTIONS_QUERY,
  RECENT_TRANSACTION_ENTRIES_QUERY,
  RECENT_WALLET_BATCHES_QUERY,
  RECENT_CONTRACT_BATCHES_QUERY,
  WALLET_BATCH_ONLY_QUERY,
  WALLET_ENTRIES_BY_TX_HASH_QUERY,
  WALLET_BATCH_DETAIL_QUERY,
  TRANSACTION_BATCH_ONLY_QUERY,
  TRANSACTION_ENTRIES_BY_TX_HASH_QUERY,
  TRANSACTION_BATCH_DETAIL_QUERY,
  CONTRACT_BATCH_DETAIL_QUERY,
  // Response types
  type RawOperatorsListResponse,
  // Dashboard response types
  type RawRegistryStatsResponse,
  type RawRecentWalletsResponse,
  type RawRecentContractsResponse,
  type RawRecentTransactionsResponse,
  type RawRecentTransactionEntriesResponse,
  type RawRecentWalletBatchesResponse,
  type RawRecentContractBatchesResponse,
  type RawWalletBatchOnlyResponse,
  type RawWalletEntriesByTxHashResponse,
  type RawWalletBatchDetailResponse,
  type RawTransactionBatchOnlyResponse,
  type RawTransactionEntriesByTxHashResponse,
  type RawTransactionBatchDetailResponse,
  type RawContractBatchDetailResponse,
} from './queries';
