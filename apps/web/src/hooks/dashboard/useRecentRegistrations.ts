/**
 * Hook to fetch recent registrations across all registry types.
 *
 * Combines wallet, contract, and transaction registrations into a unified view.
 */

import { useQuery } from '@tanstack/react-query';
import { request } from 'graphql-request';
import {
  RECENT_WALLETS_QUERY,
  RECENT_CONTRACTS_QUERY,
  RECENT_TRANSACTION_ENTRIES_QUERY,
  RECENT_TRANSACTIONS_QUERY,
  type RawRecentWalletsResponse,
  type RawRecentContractsResponse,
  type RawRecentTransactionEntriesResponse,
  type RawRecentTransactionsResponse,
} from '@swr/search';
import { logger } from '@/lib/logger';
import { INDEXER_URL } from '@/lib/indexer';
import type { Address, Hash } from '@/lib/types/ethereum';

/** Registration entry type */
export type RegistrationType = 'wallet' | 'contract' | 'transaction';

/** Unified registration entry */
export interface RegistrationEntry {
  /** Unique ID from the indexer record (composite key or address) */
  id: string;
  /** Registration type */
  type: RegistrationType;
  /** Display identifier: wallet address, contract address, or transaction hash */
  identifier: string;
  /** CAIP-2 chain ID (e.g., "eip155:8453") */
  chainId: string;
  /** Operator address (if operator submission) */
  operator?: Address;
  /** Reporter address (if individual submission) */
  reporter?: Address;
  /** Whether it was sponsored/relayed */
  isSponsored: boolean;
  /** Registration timestamp (Unix seconds) */
  registeredAt: bigint;
  /** Transaction hash (not available for contract entries) */
  transactionHash?: Hash;
  /** Batch ID reference (for contract entries) */
  batchId?: string;
}

export interface UseRecentRegistrationsOptions {
  /** Filter by type (default: all) */
  type?: RegistrationType | 'all';
  /** Number of entries to fetch per type (default: 20) */
  limit?: number;
}

export interface UseRecentRegistrationsResult {
  /** Combined registration entries, sorted by time descending */
  registrations: RegistrationEntry[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Fetch recent registrations across all registry types.
 *
 * @example
 * ```tsx
 * const { registrations, isLoading } = useRecentRegistrations({ limit: 50 });
 *
 * // Filter by type
 * const { registrations } = useRecentRegistrations({ type: 'wallet' });
 * ```
 */
export function useRecentRegistrations(
  options: UseRecentRegistrationsOptions = {}
): UseRecentRegistrationsResult {
  const { type = 'all', limit = 20 } = options;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'registrations', { type, limit }],
    queryFn: async (): Promise<RegistrationEntry[]> => {
      logger.contract.debug('Fetching recent registrations', { type, limit });

      const entries: RegistrationEntry[] = [];

      // Fetch based on filter
      const fetchWallets = type === 'all' || type === 'wallet';
      const fetchContracts = type === 'all' || type === 'contract';
      const fetchTransactions = type === 'all' || type === 'transaction';

      // Parallel fetch
      // Note: When type='all', each source fetches `limit` items independently,
      // resulting in up to 3 × limit total entries before the final sort and
      // truncation at line ~205. This ensures we capture the most recent items
      // across all types. If bandwidth becomes a concern for large limits,
      // consider reducing per-type fetches (e.g., Math.ceil(limit * 1.5)).
      const [walletsRes, contractsRes, transactionsRes, batchesRes] = await Promise.all([
        fetchWallets
          ? request<RawRecentWalletsResponse>(INDEXER_URL, RECENT_WALLETS_QUERY, {
              limit,
              offset: 0,
            })
          : null,
        fetchContracts
          ? request<RawRecentContractsResponse>(INDEXER_URL, RECENT_CONTRACTS_QUERY, {
              limit,
              offset: 0,
            })
          : null,
        fetchTransactions
          ? request<RawRecentTransactionEntriesResponse>(
              INDEXER_URL,
              RECENT_TRANSACTION_ENTRIES_QUERY,
              {
                limit,
                offset: 0,
              }
            )
          : null,
        // Also fetch transaction batches to resolve batchId for per-entry records.
        // Per-entry records (transactionInBatch) don't carry batchId from the indexer,
        // but they share the same Ethereum transactionHash with their parent batch.
        fetchTransactions
          ? request<RawRecentTransactionsResponse>(INDEXER_URL, RECENT_TRANSACTIONS_QUERY, {
              limit,
              offset: 0,
            })
          : null,
      ]);

      // Build a lookup map: Ethereum transactionHash → batchId
      // This resolves batchId for per-entry records that don't have it set directly.
      const txHashToBatchId = new Map<string, string>();
      if (batchesRes) {
        for (const batch of batchesRes.transactionBatchs.items) {
          txHashToBatchId.set(batch.transactionHash, batch.id);
        }
      }

      // Process wallets
      if (walletsRes) {
        for (const raw of walletsRes.stolenWallets.items) {
          // The chain badge comes from `reportedChainCAIP2` (where the theft was reported),
          // NOT from `caip10`.
          //
          // A registered wallet is stolen on EVERY EVM chain, so the indexer stores its
          // identifier in the CAIP-2 wildcard form `eip155:*:0x…` — matching how CAIP10.sol
          // builds the on-chain key. Parsing a chain out of that yields the literal `*`, which
          // is not a chain: it rendered as a globe icon labelled "eip155:*" with no explorer
          // link. `reportedChainCAIP2` is the real, specific chain and is what a reader wants
          // here; `sourceChainCAIP2` (the spoke a cross-chain registration arrived from) is the
          // next best answer when the reported chain could not be resolved.
          //
          // When neither resolves, fall back to the wildcard from `caip10` (e.g. `eip155:*`),
          // which the table renders as "All EVM chains". That is the honest statement — the
          // wallet IS stolen everywhere in that namespace and we simply do not know where it
          // was reported. The previous code defaulted to `eip155:1` instead, labelling such
          // rows "Ethereum" and linking to an Etherscan page for a chain the wallet was never
          // reported on, which is worse than saying nothing.
          const caip10Parts = raw.caip10.split(':');
          const wildcardChainId =
            caip10Parts[0] && caip10Parts[1] ? `${caip10Parts[0]}:${caip10Parts[1]}` : 'eip155:*';
          const chainId = raw.reportedChainCAIP2 ?? raw.sourceChainCAIP2 ?? wildcardChainId;

          // `id` is the full bytes32 identifier, so it is not an address. `walletAddress` is
          // populated for every EVM wallet and is null only for a non-EVM identifier, which
          // has no address form to show.
          const walletAddress = raw.walletAddress ?? raw.id;

          entries.push({
            id: raw.id,
            type: 'wallet',
            identifier: walletAddress,
            chainId,
            operator: raw.operator as Address | undefined,
            isSponsored: raw.isSponsored,
            registeredAt: BigInt(raw.registeredAt),
            transactionHash: raw.transactionHash as Hash,
            batchId: raw.batchId,
          });
        }
      }

      // Process contracts
      if (contractsRes) {
        for (const raw of contractsRes.fraudulentContracts.items) {
          entries.push({
            id: raw.id,
            type: 'contract',
            identifier: raw.contractAddress,
            chainId: raw.caip2ChainId,
            operator: raw.operator as Address,
            isSponsored: false, // Operator submissions are never "sponsored"
            registeredAt: BigInt(raw.reportedAt),
            // Note: batchId is not a tx hash; contracts don't have individual tx hashes
            batchId: raw.batchId,
          });
        }
      }

      // Process transactions (individual entries, not batches)
      if (transactionsRes) {
        for (const raw of transactionsRes.transactionInBatchs.items) {
          let txChainId = raw.caip2ChainId;
          if (!txChainId) {
            logger.contract.debug('Fallback to eip155:1 for transaction', {
              id: raw.id,
              txHash: raw.txHash,
            });
            txChainId = 'eip155:1';
          }
          entries.push({
            id: raw.id,
            type: 'transaction',
            identifier: raw.txHash,
            chainId: txChainId,
            reporter: raw.reporter as Address,
            isSponsored: false, // Individual tx entries don't track sponsorship
            registeredAt: BigInt(raw.reportedAt),
            transactionHash: raw.txHash as Hash,
            // Resolve batchId: prefer direct value, fall back to lookup via transactionHash
            batchId: raw.batchId ?? txHashToBatchId.get(raw.transactionHash),
          });
        }
      }

      // Sort by registration time descending
      entries.sort((a, b) => {
        if (b.registeredAt > a.registeredAt) return 1;
        if (b.registeredAt < a.registeredAt) return -1;
        return 0;
      });

      // Limit total results
      const limited = entries.slice(0, limit);

      logger.contract.info('Recent registrations fetched', {
        total: limited.length,
        wallets: walletsRes?.stolenWallets.items.length ?? 0,
        contracts: contractsRes?.fraudulentContracts.items.length ?? 0,
        transactions: transactionsRes?.transactionInBatchs.items.length ?? 0,
      });

      return limited;
    },
    staleTime: 30_000, // 30 seconds
    retry: 2,
  });

  return {
    registrations: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
