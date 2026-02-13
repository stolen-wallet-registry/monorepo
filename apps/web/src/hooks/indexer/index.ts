/**
 * Indexer hooks for querying the Ponder GraphQL API
 */

export {
  useRegistrySearch,
  detectSearchType,
  type SearchType,
  type SearchResult,
  // Address (combined wallet + contract)
  type AddressSearchData,
  type AddressSearchResult,
  // Wallet (internal)
  type WalletSearchResult,
  type WalletSearchData,
  // Contract
  type ContractSearchData,
  type ContractChainReport,
  // Transaction
  type TransactionSearchResult,
  type TransactionSearchData,
  type TransactionChainReport,
} from './useRegistrySearch';
