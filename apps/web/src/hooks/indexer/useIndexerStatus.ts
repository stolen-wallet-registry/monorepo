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

export interface UseIndexerStatusOptions {
  /** Tolerance before results are treated as stale. */
  maxLagSeconds?: number;
  /**
   * Whether to poll at all. Default true.
   *
   * Freshness only matters once there is a result to qualify, and the hook is mounted by the
   * search box, which lives on pages a user may never search from. Left ungated it polls
   * `/status` every 30s for the lifetime of the page regardless — traffic that buys nothing
   * until a search happens. Callers pass `enabled` so the polling starts with the first
   * search and stops when the component unmounts.
   */
  enabled?: boolean;
}

/**
 * How far behind the indexer is.
 *
 * @returns The status plus a `stale` flag. `stale` is true when freshness is unknown, because
 *   the absence of a freshness signal is not evidence of freshness — including while disabled,
 *   so a caller that has not started polling can never read the default as "fresh".
 */
export function useIndexerStatus({
  maxLagSeconds = DEFAULT_MAX_LAG_SECONDS,
  enabled = true,
}: UseIndexerStatusOptions = {}) {
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
    enabled,
    // Freshness is only useful if it is itself fresh.
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: 1,
  });

  return {
    ...query,
    // A failed status request means freshness is unknown, which counts as stale. So does not
    // having asked yet: `isIndexerStale(undefined)` is true by design.
    stale: query.isError ? true : isIndexerStale(query.data, maxLagSeconds),
  };
}
