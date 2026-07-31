/**
 * Indexer Freshness Hook
 *
 * Search results describe the chain as of the last block the indexer processed. An indexer
 * that is behind answers "not found" for everything registered in the gap, with no outward
 * difference from a genuinely clean address — so anything acting on a clean result needs to
 * know the lag.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getIndexerStatus,
  isIndexerStale,
  DEFAULT_MAX_LAG_SECONDS,
  type IndexerStatus,
} from '@swr/search';
import { INDEXER_URL } from '@/lib/indexer';
import { logger } from '@/lib/logger';

export { DEFAULT_MAX_LAG_SECONDS };
export type { IndexerStatus };

/**
 * How far behind the indexer is.
 *
 * @param maxLagSeconds - Tolerance before results are treated as stale
 * @returns The status plus a `stale` flag. `stale` is true when freshness is unknown, because
 *   the absence of a freshness signal is not evidence of freshness.
 */
export function useIndexerStatus(maxLagSeconds: number = DEFAULT_MAX_LAG_SECONDS) {
  const query = useQuery({
    queryKey: ['indexer-status'],
    queryFn: async (): Promise<IndexerStatus> => {
      const status = await getIndexerStatus({ indexerUrl: INDEXER_URL });
      logger.contract.debug('Indexer status', {
        lagSeconds: status.lagSeconds,
        chains: status.chains.length,
      });
      return status;
    },
    // Freshness is only useful if it is itself fresh.
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  return {
    ...query,
    // A failed status request means freshness is unknown, which counts as stale.
    stale: query.isError ? true : isIndexerStale(query.data, maxLagSeconds),
  };
}
