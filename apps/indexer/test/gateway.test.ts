import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_BLOCKED_PATHS,
  createGatewayServer,
  hasValidMetricsToken,
  isBlockedPath,
  normalisePath,
  parseBlockedPaths,
} from '../gateway.mjs';

/**
 * Audit V17 — `/metrics` is a full Prometheus dump (indexing progress, DB pool state,
 * per-chain RPC counters) that ponder mounts before our app and returns from without calling
 * `next()`, so no application middleware can gate it. The gateway process owns the public
 * port instead, and these tests are what make that a tested control rather than an untracked
 * rule in somebody's CDN console.
 */

// ═══════════════════════════════════════════════════════════════════════════
// PATH MATCHING
// ═══════════════════════════════════════════════════════════════════════════

describe('normalisePath', () => {
  it.each([
    ['/metrics', '/metrics'],
    ['/metrics/', '/metrics'],
    ['/metrics?format=prometheus', '/metrics'],
    ['/metrics#frag', '/metrics'],
    ['/METRICS', '/metrics'],
    ['//metrics', '/metrics'],
    // Percent-encoding must be decoded before the comparison, or `/%6detrics` walks past a
    // literal string match and reaches ponder.
    ['/%6d%65trics', '/metrics'],
    ['/', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalisePath(input)).toBe(expected);
  });

  // A URL whose escapes cannot be decoded must not fall through to "allow".
  it('does not throw on a malformed escape sequence', () => {
    expect(() => normalisePath('/%E0%A4%A')).not.toThrow();
  });
});

describe('parseBlockedPaths', () => {
  it('defaults to /metrics', () => {
    expect(parseBlockedPaths(undefined)).toEqual(DEFAULT_BLOCKED_PATHS);
    expect(DEFAULT_BLOCKED_PATHS).toContain('/metrics');
  });

  it('accepts a comma-separated list and normalises leading slashes', () => {
    expect(parseBlockedPaths('metrics, /status')).toEqual(['/metrics', '/status']);
  });

  // Opting out has to be explicit and visible, not something an empty env var does by accident
  // — hence "" disables and `undefined` (unset) keeps the default.
  it('treats an explicitly empty value as "block nothing"', () => {
    expect(parseBlockedPaths('')).toEqual([]);
  });
});

describe('isBlockedPath', () => {
  it('blocks /metrics in every casing and encoding', () => {
    for (const url of ['/metrics', '/Metrics/', '/%6detrics?x=1']) {
      expect(isBlockedPath(url, DEFAULT_BLOCKED_PATHS)).toBe(true);
    }
  });

  // /ready is railway.toml's healthcheck path — blocking it would make every deploy fail.
  it('leaves /ready, /health, /status and the GraphQL root reachable by default', () => {
    for (const url of ['/ready', '/health', '/status', '/', '/graphql']) {
      expect(isBlockedPath(url, DEFAULT_BLOCKED_PATHS)).toBe(false);
    }
  });

  it('does not block a path that merely contains a blocked segment', () => {
    expect(isBlockedPath('/api/metrics-export', DEFAULT_BLOCKED_PATHS)).toBe(false);
  });
});

describe('hasValidMetricsToken', () => {
  it('rejects when no token is configured, whatever is presented', () => {
    expect(hasValidMetricsToken('Bearer anything', undefined)).toBe(false);
    expect(hasValidMetricsToken('Bearer anything', '')).toBe(false);
  });

  it('accepts the exact bearer token', () => {
    expect(hasValidMetricsToken('Bearer s3cret', 's3cret')).toBe(true);
    expect(hasValidMetricsToken('bearer s3cret', 's3cret')).toBe(true);
  });

  it.each([undefined, 'Bearer wrong', 'Basic s3cret', 's3cret'])('rejects %o', (header) => {
    expect(hasValidMetricsToken(header, 's3cret')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// END TO END THROUGH THE PROXY
// ═══════════════════════════════════════════════════════════════════════════

describe('gateway server', () => {
  let upstream: http.Server;
  let gateway: http.Server;
  let gatewayPort: number;
  const upstreamHits: string[] = [];

  beforeAll(async () => {
    // Stand in for ponder: answers everything, and records what reached it. If /metrics ever
    // appears in `upstreamHits`, the block leaked.
    upstream = http.createServer((req, res) => {
      upstreamHits.push(req.url ?? '');
      res.writeHead(200, { 'Content-Type': 'text/plain', 'X-From': 'upstream' });
      res.end(`upstream:${req.method}:${req.url}`);
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;

    gateway = createGatewayServer({ upstreamPort, metricsToken: 's3cret' });
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    gatewayPort = (gateway.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  async function get(path: string, headers: Record<string, string> = {}) {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}${path}`, { headers });
    return { status: response.status, body: await response.text() };
  }

  it('proxies /graphql through to the indexer', async () => {
    const response = await get('/graphql');
    expect(response.status).toBe(200);
    expect(response.body).toContain('upstream:GET:/graphql');
  });

  it('proxies the healthcheck path railway.toml depends on', async () => {
    expect((await get('/ready')).status).toBe(200);
  });

  // 404 rather than 403: 403 confirms the endpoint exists.
  it('returns 404 for /metrics and never reaches the indexer', async () => {
    upstreamHits.length = 0;
    const response = await get('/metrics');
    expect(response.status).toBe(404);
    expect(response.body).not.toContain('upstream');
    expect(upstreamHits).toEqual([]);
  });

  it('blocks the encoded and trailing-slash variants too', async () => {
    upstreamHits.length = 0;
    for (const path of ['/metrics/', '/%6d%65trics', '/METRICS?x=1']) {
      expect((await get(path)).status).toBe(404);
    }
    expect(upstreamHits).toEqual([]);
  });

  it('lets an authorised monitoring scrape through', async () => {
    const response = await get('/metrics', { authorization: 'Bearer s3cret' });
    expect(response.status).toBe(200);
    expect(response.body).toContain('upstream:GET:/metrics');
  });

  it('rejects a wrong token', async () => {
    expect((await get('/metrics', { authorization: 'Bearer nope' })).status).toBe(404);
  });

  it('returns 502 rather than hanging when the indexer is down', async () => {
    const orphan = createGatewayServer({ upstreamPort: 1 });
    await new Promise<void>((resolve) => orphan.listen(0, '127.0.0.1', resolve));
    const port = (orphan.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/graphql`);
    expect(response.status).toBe(502);
    await new Promise<void>((resolve) => orphan.close(() => resolve()));
  });
});
