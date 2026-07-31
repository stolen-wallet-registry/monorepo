/**
 * Indexer freshness.
 *
 * Every search result is a statement about the chain as of the last block the indexer
 * processed. An indexer that is behind answers `found: false` for everything registered in
 * the gap, with no outward difference from a genuinely clean address — so consumers that act
 * on a clean result need to know how fresh it is.
 *
 * Ponder serves this at `GET /status`, shaped as:
 * `{ "<chainName>": { "id": 8453, "block": { "number": 123, "timestamp": 1700000000 } } }`
 */

import type { IndexerChainStatus, IndexerStatus, SearchConfig } from './types';

/** Raw shape of one entry in ponder's `/status` response. */
interface RawStatusEntry {
  id?: number;
  block?: { number?: number; timestamp?: number } | null;
}

/**
 * Fetch how far the indexer has progressed on each chain.
 *
 * Throws when `/status` is unreachable or malformed. Callers treat a throw as "freshness
 * unknown" — which is itself a reason not to present a clean result as authoritative.
 *
 * @param config - Search configuration with indexer URL
 * @param now - Current time in Unix seconds; injectable for tests
 */
export async function getIndexerStatus(
  config: SearchConfig,
  now: number = Math.floor(Date.now() / 1000)
): Promise<IndexerStatus> {
  const url = `${config.indexerUrl.replace(/\/+$/, '')}/status`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Indexer status request failed with HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();

  if (raw === null || typeof raw !== 'object') {
    throw new Error('Indexer status response was not an object');
  }

  const chains: IndexerChainStatus[] = [];

  for (const [chainName, value] of Object.entries(raw as Record<string, RawStatusEntry>)) {
    const blockNumber = value?.block?.number;
    const blockTimestamp = value?.block?.timestamp;
    const chainId = value?.id;

    // Skip malformed entries rather than failing the whole call: one unconfigured chain
    // should not erase the freshness signal for the chains that did report.
    if (
      typeof chainId !== 'number' ||
      typeof blockNumber !== 'number' ||
      typeof blockTimestamp !== 'number'
    ) {
      continue;
    }

    chains.push({ chainName, chainId, blockNumber, blockTimestamp });
  }

  chains.sort((a, b) => a.chainId - b.chainId);

  // The worst chain governs: an answer is only as fresh as the least-fresh registry it
  // consulted, and a wallet is registered across every EVM chain.
  const oldestBlockTimestamp =
    chains.length > 0 ? Math.min(...chains.map((c) => c.blockTimestamp)) : null;

  return {
    chains,
    oldestBlockTimestamp,
    // Clamp at zero: a block timestamp slightly ahead of local clock skew is not negative lag.
    lagSeconds: oldestBlockTimestamp === null ? null : Math.max(0, now - oldestBlockTimestamp),
  };
}

/**
 * Default tolerance before an indexer's answers should be labelled stale.
 *
 * Two minutes covers ordinary L2 block times and indexing jitter while still catching a
 * stalled or backfilling indexer.
 */
export const DEFAULT_MAX_LAG_SECONDS = 120;

/**
 * Whether the indexer is too far behind for a `found: false` to be presented as clean.
 *
 * Unknown lag counts as stale — the absence of a freshness signal is not evidence of
 * freshness.
 */
export function isIndexerStale(
  status: IndexerStatus | null | undefined,
  maxLagSeconds: number = DEFAULT_MAX_LAG_SECONDS
): boolean {
  if (!status || status.lagSeconds === null) return true;
  return status.lagSeconds > maxLagSeconds;
}
