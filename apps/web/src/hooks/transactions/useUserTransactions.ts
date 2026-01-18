/**
 * Hook to fetch a user's recent transactions.
 *
 * Environment handling:
 * - Local Anvil (31337/31338): Query RPC directly via viem
 * - Testnets/Mainnets: Use Alchemy's Enhanced Transaction APIs
 *
 * Note: For production deployment, configure VITE_ALCHEMY_API_KEY
 */

import { useState, useEffect, useCallback } from 'react';
import { useChainId, usePublicClient } from 'wagmi';
import { isLocalChain } from '@swr/chains';
import type { Address, Hash } from '@/lib/types/ethereum';
import { logger } from '@/lib/logger';

export interface UserTransaction {
  hash: Hash;
  blockNumber: bigint;
  from: Address;
  to: Address | null;
  value: bigint;
  timestamp?: number;
  chainId: number;
}

export interface UseUserTransactionsResult {
  transactions: UserTransaction[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  /** Lowest block number scanned so far */
  lowestBlockScanned: bigint | null;
}

/**
 * Batch size for parallel block fetches on local Anvil.
 * Higher = faster but more concurrent RPC calls.
 */
const LOCAL_BLOCK_BATCH_SIZE = 20;

/**
 * Initial number of blocks to scan on first load.
 * User can click "Load More" to scan further back.
 */
const INITIAL_BLOCKS_TO_SCAN = 200;

/**
 * Number of additional blocks to scan when user clicks "Load More".
 */
const LOAD_MORE_BLOCKS = 200;

/**
 * Hook to fetch user's transaction history with pagination support.
 *
 * @param address - User's wallet address
 * @param enabled - Whether to fetch (default: true)
 * @returns Transaction list, loading state, and pagination controls
 */
export function useUserTransactions(
  address: Address | undefined,
  enabled: boolean = true
): UseUserTransactionsResult {
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lowestBlockScanned, setLowestBlockScanned] = useState<bigint | null>(null);
  const [hasMore, setHasMore] = useState(true);

  /**
   * Scan a range of blocks for transactions from the given address.
   */
  const scanBlockRange = useCallback(
    async (
      fromBlock: bigint,
      toBlock: bigint,
      existingTxs: UserTransaction[]
    ): Promise<{ transactions: UserTransaction[]; lowestScanned: bigint }> => {
      if (!publicClient || !address) {
        return { transactions: existingTxs, lowestScanned: fromBlock };
      }

      const userTransactions: UserTransaction[] = [...existingTxs];

      // Build list of blocks to scan (from high to low)
      const blockNumbers: bigint[] = [];
      for (let blockNum = fromBlock; blockNum >= toBlock; blockNum--) {
        blockNumbers.push(blockNum);
      }

      // Process in batches for efficiency
      for (let i = 0; i < blockNumbers.length; i += LOCAL_BLOCK_BATCH_SIZE) {
        const batch = blockNumbers.slice(i, i + LOCAL_BLOCK_BATCH_SIZE);
        const blocks = await Promise.all(
          batch.map((blockNum) =>
            publicClient
              .getBlock({ blockNumber: blockNum, includeTransactions: true })
              .catch(() => null)
          )
        );

        for (const block of blocks) {
          if (!block?.transactions) continue;

          // Filter transactions from this address (outgoing)
          for (const tx of block.transactions) {
            // Skip string hashes (only full tx objects have .from)
            if (typeof tx === 'string') continue;

            if (tx.from.toLowerCase() === address.toLowerCase()) {
              userTransactions.push({
                hash: tx.hash as Hash,
                blockNumber: block.number ?? 0n,
                from: tx.from as Address,
                to: (tx.to as Address) ?? null,
                value: tx.value ?? 0n,
                timestamp: block.timestamp ? Number(block.timestamp) * 1000 : undefined,
                chainId,
              });
            }
          }
        }
      }

      // Sort by block number descending (most recent first)
      userTransactions.sort((a, b) => Number(b.blockNumber - a.blockNumber));

      return { transactions: userTransactions, lowestScanned: toBlock };
    },
    [publicClient, address, chainId]
  );

  /**
   * Initial fetch - scan recent blocks.
   */
  const fetchTransactions = useCallback(async () => {
    if (!address || !enabled || !publicClient) {
      // Clear stale state when disabled or disconnected
      setTransactions([]);
      setError(null);
      setIsLoading(false);
      setLowestBlockScanned(null);
      setHasMore(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isLocalChain(chainId)) {
        // Local Anvil: Query RPC directly
        const latestBlock = await publicClient.getBlockNumber();
        const startBlock = latestBlock;
        const endBlock =
          latestBlock > BigInt(INITIAL_BLOCKS_TO_SCAN)
            ? latestBlock - BigInt(INITIAL_BLOCKS_TO_SCAN)
            : 0n;

        logger.store.debug('Initial scan of local Anvil chain', {
          address,
          chainId,
          latestBlock: latestBlock.toString(),
          scanRange: `${endBlock.toString()} - ${startBlock.toString()}`,
        });

        const { transactions: userTransactions, lowestScanned } = await scanBlockRange(
          startBlock,
          endBlock,
          []
        );

        logger.store.info('Fetched local transactions', {
          address,
          blocksScanned: Number(startBlock - endBlock) + 1,
          transactionsFound: userTransactions.length,
          lowestBlock: lowestScanned.toString(),
        });

        setTransactions(userTransactions);
        setLowestBlockScanned(lowestScanned);
        setHasMore(lowestScanned > 0n);
      } else {
        // Production/Testnet: Use Alchemy Enhanced APIs
        // TODO: Implement Alchemy SDK integration
        logger.store.info('Production transaction fetching requires Alchemy SDK', {
          address,
          chainId,
        });

        setError(new Error('Transaction history not available for this network yet'));
        setTransactions([]);
        setHasMore(false);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      logger.store.error('Failed to fetch user transactions', {
        address,
        chainId,
        error: errorObj.message,
      });
      setError(errorObj);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, enabled, publicClient, scanBlockRange]);

  /**
   * Load more transactions from earlier blocks.
   */
  const loadMore = useCallback(async () => {
    if (!address || !publicClient || lowestBlockScanned === null || lowestBlockScanned <= 0n) {
      return;
    }

    if (!isLocalChain(chainId)) {
      // Production load more - not implemented yet
      return;
    }

    setIsLoadingMore(true);

    try {
      const startBlock = lowestBlockScanned - 1n;
      const endBlock =
        startBlock > BigInt(LOAD_MORE_BLOCKS) ? startBlock - BigInt(LOAD_MORE_BLOCKS) : 0n;

      logger.store.debug('Loading more transactions', {
        address,
        chainId,
        scanRange: `${endBlock.toString()} - ${startBlock.toString()}`,
      });

      const { transactions: updatedTxs, lowestScanned } = await scanBlockRange(
        startBlock,
        endBlock,
        transactions
      );

      logger.store.info('Loaded more transactions', {
        previousCount: transactions.length,
        newCount: updatedTxs.length,
        lowestBlock: lowestScanned.toString(),
      });

      setTransactions(updatedTxs);
      setLowestBlockScanned(lowestScanned);
      setHasMore(lowestScanned > 0n);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      logger.store.error('Failed to load more transactions', {
        address,
        chainId,
        error: errorObj.message,
      });
      // Don't clear transactions on load more error
    } finally {
      setIsLoadingMore(false);
    }
  }, [address, chainId, publicClient, lowestBlockScanned, transactions, scanBlockRange]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    isLoading,
    isLoadingMore,
    isError: !!error,
    error,
    refetch: fetchTransactions,
    loadMore,
    hasMore,
    lowestBlockScanned,
  };
}

/**
 * Check if a transaction is likely fraudulent based on simple heuristics.
 * This is a placeholder - real fraud detection would be much more sophisticated.
 */
export function isSuspiciousTransaction(tx: UserTransaction): boolean {
  // Example heuristics (not real fraud detection):
  // - Large value transfers
  // - Transfers to new/unknown addresses
  // - Contract interactions with high gas

  const ONE_ETH = 1000000000000000000n;
  return tx.value > ONE_ETH * 10n; // Transfers over 10 ETH flagged as "suspicious"
}
