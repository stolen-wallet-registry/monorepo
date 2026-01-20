/**
 * Registry Search Hook
 *
 * Searches the Ponder indexer for wallets and transactions.
 * Auto-detects input type (wallet address, tx hash, or CAIP-10).
 */

import { useQuery } from '@tanstack/react-query';
import { request, gql } from 'graphql-request';
import { getCAIP2ChainName } from '@swr/chains';
import type { Address, Hash } from '@/lib/types/ethereum';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:42069';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type SearchType = 'wallet' | 'transaction' | 'caip10' | 'invalid';

export interface WalletSearchData {
  address: Address;
  caip10: string;
  registeredAt: bigint;
  transactionHash: Hash;
  isSponsored: boolean;
  sourceChainCAIP2?: string;
  sourceChainName?: string;
}

export interface TransactionSearchData {
  txHash: Hash;
  chains: Array<{
    caip2ChainId: string;
    chainName: string;
    numericChainId?: number;
    batchId: Hash;
    reporter: Address;
    reportedAt: bigint;
  }>;
}

export interface WalletSearchResult {
  type: 'wallet';
  found: boolean;
  data: WalletSearchData | null;
}

export interface TransactionSearchResult {
  type: 'transaction';
  found: boolean;
  data: TransactionSearchData | null;
}

export interface InvalidSearchResult {
  type: 'invalid';
  found: false;
  data: null;
}

export type SearchResult = WalletSearchResult | TransactionSearchResult | InvalidSearchResult;

// ═══════════════════════════════════════════════════════════════════════════
// INPUT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the type of search input
 */
export function detectSearchType(input: string): SearchType {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) return 'invalid';

  // CAIP-10 format: eip155:8453:0x...
  if (trimmed.includes(':') && trimmed.split(':').length === 3) {
    return 'caip10';
  }

  // Wallet address: 0x + 40 hex chars = 42 chars
  if (trimmed.length === 42 && trimmed.startsWith('0x') && /^0x[0-9a-f]{40}$/.test(trimmed)) {
    return 'wallet';
  }

  // Transaction hash: 0x + 64 hex chars = 66 chars
  if (trimmed.length === 66 && trimmed.startsWith('0x') && /^0x[0-9a-f]{64}$/.test(trimmed)) {
    return 'transaction';
  }

  return 'invalid';
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPHQL QUERIES
// ═══════════════════════════════════════════════════════════════════════════

const WALLET_QUERY = gql`
  query SearchWallet($address: String!) {
    stolenWallet(id: $address) {
      id
      caip10
      registeredAt
      transactionHash
      isSponsored
      sourceChainCAIP2
    }
  }
`;

const WALLET_BY_CAIP10_QUERY = gql`
  query SearchWalletByCAIP10($caip10: String!) {
    stolenWallets(where: { caip10: $caip10 }, limit: 1) {
      items {
        id
        caip10
        registeredAt
        transactionHash
        isSponsored
        sourceChainCAIP2
      }
    }
  }
`;

const TRANSACTION_QUERY = gql`
  query SearchTransaction($txHash: String!) {
    transactionInBatchs(where: { txHash: $txHash }) {
      items {
        id
        txHash
        caip2ChainId
        numericChainId
        batchId
        reporter
        reportedAt
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function searchWallet(address: string): Promise<WalletSearchResult> {
  try {
    const result = await request<{
      stolenWallet: {
        id: string;
        caip10: string;
        registeredAt: string;
        transactionHash: string;
        isSponsored: boolean;
        sourceChainCAIP2?: string;
      } | null;
    }>(INDEXER_URL, WALLET_QUERY, { address: address.toLowerCase() });

    const wallet = result.stolenWallet;

    if (!wallet) {
      return { type: 'wallet', found: false, data: null };
    }

    return {
      type: 'wallet',
      found: true,
      data: {
        address: wallet.id as Address,
        caip10: wallet.caip10,
        registeredAt: BigInt(wallet.registeredAt),
        transactionHash: wallet.transactionHash as Hash,
        isSponsored: wallet.isSponsored,
        sourceChainCAIP2: wallet.sourceChainCAIP2,
        sourceChainName: wallet.sourceChainCAIP2
          ? getCAIP2ChainName(wallet.sourceChainCAIP2)
          : undefined,
      },
    };
  } catch (error) {
    console.error('Wallet search error:', error);
    return { type: 'wallet', found: false, data: null };
  }
}

async function searchWalletByCAIP10(caip10: string): Promise<WalletSearchResult> {
  try {
    const result = await request<{
      stolenWallets: {
        items: Array<{
          id: string;
          caip10: string;
          registeredAt: string;
          transactionHash: string;
          isSponsored: boolean;
          sourceChainCAIP2?: string;
        }>;
      };
    }>(INDEXER_URL, WALLET_BY_CAIP10_QUERY, { caip10: caip10.toLowerCase() });

    const wallet = result.stolenWallets?.items?.[0];

    if (!wallet) {
      return { type: 'wallet', found: false, data: null };
    }

    return {
      type: 'wallet',
      found: true,
      data: {
        address: wallet.id as Address,
        caip10: wallet.caip10,
        registeredAt: BigInt(wallet.registeredAt),
        transactionHash: wallet.transactionHash as Hash,
        isSponsored: wallet.isSponsored,
        sourceChainCAIP2: wallet.sourceChainCAIP2,
        sourceChainName: wallet.sourceChainCAIP2
          ? getCAIP2ChainName(wallet.sourceChainCAIP2)
          : undefined,
      },
    };
  } catch (error) {
    console.error('CAIP-10 search error:', error);
    return { type: 'wallet', found: false, data: null };
  }
}

async function searchTransaction(txHash: string): Promise<TransactionSearchResult> {
  try {
    const result = await request<{
      transactionInBatchs: {
        items: Array<{
          id: string;
          txHash: string;
          caip2ChainId: string;
          numericChainId?: number;
          batchId: string;
          reporter: string;
          reportedAt: string;
        }>;
      };
    }>(INDEXER_URL, TRANSACTION_QUERY, { txHash: txHash.toLowerCase() });

    const transactions = result.transactionInBatchs?.items ?? [];

    if (transactions.length === 0) {
      return { type: 'transaction', found: false, data: null };
    }

    return {
      type: 'transaction',
      found: true,
      data: {
        txHash: transactions[0].txHash as Hash,
        chains: transactions.map((t) => ({
          caip2ChainId: t.caip2ChainId,
          chainName: getCAIP2ChainName(t.caip2ChainId),
          numericChainId: t.numericChainId,
          batchId: t.batchId as Hash,
          reporter: t.reporter as Address,
          reportedAt: BigInt(t.reportedAt),
        })),
      },
    };
  } catch (error) {
    console.error('Transaction search error:', error);
    return { type: 'transaction', found: false, data: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search the registry for wallets or transactions
 *
 * @param query - Wallet address, transaction hash, or CAIP-10 identifier
 * @returns Search result with type detection
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useRegistrySearch('0x123...');
 *
 * if (data?.found) {
 *   if (data.type === 'wallet') {
 *     console.log('Wallet is stolen:', data.data.address);
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
      if (searchType === 'invalid' || !query.trim()) {
        return { type: 'invalid', found: false, data: null };
      }

      if (searchType === 'wallet') {
        return searchWallet(query);
      }

      if (searchType === 'caip10') {
        return searchWalletByCAIP10(query);
      }

      if (searchType === 'transaction') {
        return searchTransaction(query);
      }

      return { type: 'invalid', found: false, data: null };
    },
    enabled: query.trim().length >= 10 && searchType !== 'invalid',
    staleTime: 30_000, // 30 seconds
    retry: 1,
  });
}

/**
 * Get the detected search type for an input
 */
export function useSearchType(query: string): SearchType {
  return detectSearchType(query);
}
