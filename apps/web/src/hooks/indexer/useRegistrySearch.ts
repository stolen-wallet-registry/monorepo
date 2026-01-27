/**
 * Registry Search Hook
 *
 * React hook wrapper around @swr/search for use with TanStack Query.
 * Auto-detects input type (wallet address, tx hash, or CAIP-10).
 */

import { useQuery } from '@tanstack/react-query';
import {
  search,
  detectSearchType,
  type SearchConfig,
  type SearchResult,
  type SearchType,
} from '@swr/search';
import { INDEXER_URL } from '@/lib/indexer';

// Re-export types from @swr/search for convenience
export type {
  SearchType,
  SearchResult,
  // Address (combined wallet + contract)
  AddressSearchData,
  AddressSearchResult,
  // Wallet (internal/backward compat)
  WalletSearchData,
  WalletSearchResult,
  // Contract
  ContractSearchData,
  ContractChainReport,
  // Transaction
  TransactionSearchData,
  TransactionSearchResult,
  TransactionChainReport,
  // Invalid
  InvalidSearchResult,
} from '@swr/search';

// Re-export utilities from @swr/search
export {
  detectSearchType,
  isAddress,
  isTransactionHash,
  isCAIP10,
  parseCAIP10,
  getResultStatus,
  getStatusLabel,
  getStatusDescription,
  isCompromised,
  formatTimestamp,
  formatRelativeTime,
  truncateHash,
} from '@swr/search';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const searchConfig: SearchConfig = {
  indexerUrl: INDEXER_URL,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search the registry for addresses or transactions.
 *
 * Uses TanStack Query for caching and request deduplication.
 * Auto-detects input type (address, tx hash, or CAIP-10).
 *
 * For addresses, queries BOTH stolen wallet registry AND fraudulent contract
 * registry in parallel, returning combined results.
 *
 * @param query - Address, transaction hash, or CAIP-10 identifier
 * @returns TanStack Query result with search data
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useRegistrySearch('0x123...');
 *
 * if (data?.found) {
 *   if (data.type === 'address') {
 *     // Found in wallet and/or contract registry
 *     if (data.foundInWalletRegistry) {
 *       console.log('Found in stolen wallet registry');
 *     }
 *     if (data.foundInContractRegistry) {
 *       console.log('Found in fraudulent contract registry');
 *     }
 *   } else if (data.type === 'transaction') {
 *     console.log('Transaction is reported:', data.data.txHash);
 *   }
 * }
 * ```
 */
export function useRegistrySearch(query: string) {
  const searchType = detectSearchType(query);

  return useQuery({
    queryKey: ['registry-search', query],
    queryFn: async (): Promise<SearchResult> => {
      return search(searchConfig, query);
    },
    enabled: query.trim().length >= 10 && searchType !== 'invalid',
    staleTime: 30_000, // 30 seconds
    retry: 1,
  });
}

/**
 * Get the detected search type for an input.
 *
 * @param query - User input to analyze
 * @returns Detected type: 'address' | 'transaction' | 'caip10' | 'invalid'
 */
export function useSearchType(query: string): SearchType {
  return detectSearchType(query);
}
