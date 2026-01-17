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
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Batch size for parallel block fetches on local Anvil.
 * Higher = faster but more concurrent RPC calls.
 */
const LOCAL_BLOCK_BATCH_SIZE = 20;

/**
 * Check if chainId is a local Anvil chain.
 */
function isLocalChain(chainId: number): boolean {
  return chainId === 31337 || chainId === 31338;
}

/**
 * Hook to fetch user's transaction history.
 *
 * @param address - User's wallet address
 * @param enabled - Whether to fetch (default: true)
 * @returns Transaction list and loading state
 */
export function useUserTransactions(
  address: Address | undefined,
  enabled: boolean = true
): UseUserTransactionsResult {
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [transactions, setTransactions] = useState<UserTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!address || !enabled || !publicClient) {
      // Clear stale state when disabled or disconnected
      setTransactions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isLocalChain(chainId)) {
        // Local Anvil: Query RPC directly from genesis
        // On Anvil, total block count is typically <1000, so full scan is feasible
        const latestBlock = await publicClient.getBlockNumber();
        const totalBlocks = Number(latestBlock) + 1;

        logger.store.debug('Scanning local Anvil chain from genesis', {
          address,
          chainId,
          totalBlocks,
        });

        const userTransactions: UserTransaction[] = [];

        // Scan ALL blocks from genesis (block 0) to latest
        const blockNumbers: bigint[] = [];
        for (let blockNum = latestBlock; blockNum >= 0n; blockNum--) {
          blockNumbers.push(blockNum);
        }

        // Process in batches for efficiency
        let processedBlocks = 0;
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

            // Filter transactions from this address
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

          processedBlocks += batch.length;
          // Log progress for larger chains (every 100 blocks)
          if (totalBlocks > 100 && processedBlocks % 100 === 0) {
            logger.store.debug('Scan progress', {
              processed: processedBlocks,
              total: totalBlocks,
              found: userTransactions.length,
            });
          }
        }

        // Sort by block number descending (most recent first)
        userTransactions.sort((a, b) => Number(b.blockNumber - a.blockNumber));

        logger.store.info('Fetched local transactions', {
          address,
          blocksScanned: totalBlocks,
          transactionsFound: userTransactions.length,
        });

        setTransactions(userTransactions);
      } else {
        // Production/Testnet: Use Alchemy Enhanced APIs
        // TODO: Implement Alchemy SDK integration
        // Requires: pnpm add alchemy-sdk
        logger.store.info('Production transaction fetching requires Alchemy SDK', {
          address,
          chainId,
        });

        // For now, set error state - implement when alchemy-sdk is added
        setError(new Error('Transaction history not available for this network yet'));
        setTransactions([]);
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
  }, [address, chainId, enabled, publicClient]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    isLoading,
    isError: !!error,
    error,
    refetch: fetchTransactions,
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
