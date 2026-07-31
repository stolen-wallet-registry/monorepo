/**
 * Tests for indexer freshness.
 *
 * The failure being guarded against: an indexer 10,000 blocks behind answers `found: false`
 * for everything registered in that gap, with full confidence and no outward difference from
 * a genuinely clean address.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getIndexerStatus, isIndexerStale, DEFAULT_MAX_LAG_SECONDS } from './status';
import type { SearchConfig } from './types';

const config: SearchConfig = { indexerUrl: 'http://indexer.test' };
const NOW = 1_700_000_000;

/** Shape ponder serves at GET /status. */
function statusResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getIndexerStatus', () => {
  it('parses per-chain progress and orders by chain ID', async () => {
    vi.stubGlobal(
      'fetch',
      statusResponse({
        base: { id: 8453, block: { number: 100, timestamp: NOW - 10 } },
        optimism: { id: 10, block: { number: 200, timestamp: NOW - 30 } },
      })
    );

    const status = await getIndexerStatus(config, NOW);

    expect(status.chains.map((c) => c.chainId)).toEqual([10, 8453]);
    expect(status.chains[0]).toMatchObject({ chainName: 'optimism', blockNumber: 200 });
  });

  it('reports lag from the LEAST fresh chain', async () => {
    // A wallet is registered across every EVM chain, so an answer is only as fresh as the
    // worst chain the indexer is tracking. Taking the best would hide exactly the gap.
    vi.stubGlobal(
      'fetch',
      statusResponse({
        base: { id: 8453, block: { number: 100, timestamp: NOW - 5 } },
        optimism: { id: 10, block: { number: 200, timestamp: NOW - 3600 } },
      })
    );

    const status = await getIndexerStatus(config, NOW);

    expect(status.lagSeconds).toBe(3600);
    expect(status.oldestBlockTimestamp).toBe(NOW - 3600);
  });

  it('clamps clock skew rather than reporting negative lag', async () => {
    vi.stubGlobal(
      'fetch',
      statusResponse({ base: { id: 8453, block: { number: 1, timestamp: NOW + 30 } } })
    );

    const status = await getIndexerStatus(config, NOW);

    expect(status.lagSeconds).toBe(0);
  });

  it('appends /status to the indexer URL without doubling the slash', async () => {
    const fetchMock = statusResponse({});
    vi.stubGlobal('fetch', fetchMock);

    await getIndexerStatus({ indexerUrl: 'http://indexer.test/' }, NOW);

    expect(fetchMock).toHaveBeenCalledWith('http://indexer.test/status');
  });

  it('skips a malformed chain entry instead of discarding the whole signal', async () => {
    vi.stubGlobal(
      'fetch',
      statusResponse({
        base: { id: 8453, block: { number: 100, timestamp: NOW - 10 } },
        broken: { id: 999, block: null },
      })
    );

    const status = await getIndexerStatus(config, NOW);

    expect(status.chains).toHaveLength(1);
    expect(status.lagSeconds).toBe(10);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', statusResponse({}, false, 503));

    await expect(getIndexerStatus(config, NOW)).rejects.toThrow('HTTP 503');
  });

  it('reports unknown lag when no chain reported', async () => {
    vi.stubGlobal('fetch', statusResponse({}));

    const status = await getIndexerStatus(config, NOW);

    expect(status.lagSeconds).toBeNull();
    expect(status.oldestBlockTimestamp).toBeNull();
  });
});

describe('isIndexerStale', () => {
  it('treats a fresh indexer as usable', () => {
    expect(isIndexerStale({ chains: [], oldestBlockTimestamp: NOW, lagSeconds: 5 })).toBe(false);
  });

  it('treats lag beyond the tolerance as stale', () => {
    expect(
      isIndexerStale({
        chains: [],
        oldestBlockTimestamp: NOW,
        lagSeconds: DEFAULT_MAX_LAG_SECONDS + 1,
      })
    ).toBe(true);
  });

  it('treats unknown freshness as stale', () => {
    // Absence of a freshness signal is not evidence of freshness — the whole point is to
    // avoid presenting an unverified "clean" as authoritative.
    expect(isIndexerStale(null)).toBe(true);
    expect(isIndexerStale({ chains: [], oldestBlockTimestamp: null, lagSeconds: null })).toBe(true);
  });
});
