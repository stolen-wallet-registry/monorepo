import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_BLOCKED_PATHS,
  DEFAULT_LIMITED_PATHS,
  buildUpstreamHeaders,
  createGatewayServer,
  createRateLimiter,
  hasValidMetricsToken,
  isBlockedPath,
  isLoopback,
  normalisePath,
  normaliseSocketAddress,
  parseBlockedPaths,
  resolveForwardedClient,
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
// CLIENT IDENTITY
// ═══════════════════════════════════════════════════════════════════════════

describe('normaliseSocketAddress', () => {
  // Node reports IPv4 clients on a dual-stack socket as ::ffff:1.2.3.4. Left alone, the same
  // client gets two rate-limit buckets depending on how the listener was bound.
  it('unwraps IPv4-mapped IPv6', () => {
    expect(normaliseSocketAddress('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('lowercases and passes through everything else', () => {
    expect(normaliseSocketAddress('2001:DB8::1')).toBe('2001:db8::1');
    expect(normaliseSocketAddress('203.0.113.9')).toBe('203.0.113.9');
  });

  it('returns undefined for an absent address', () => {
    expect(normaliseSocketAddress(undefined)).toBeUndefined();
    expect(normaliseSocketAddress('')).toBeUndefined();
  });
});

describe('resolveForwardedClient', () => {
  // The default. Nothing is in front of the gateway in the documented `docker run` deployment,
  // so a client-supplied X-Forwarded-For must be ignored outright — otherwise an attacker
  // rotates it per request and the rate limiter never fires.
  it('ignores X-Forwarded-For entirely when no proxy is trusted', () => {
    expect(resolveForwardedClient('1.2.3.4', '203.0.113.9', 0)).toBe('203.0.113.9');
    expect(resolveForwardedClient('evil, evil2', '203.0.113.9', 0)).toBe('203.0.113.9');
  });

  it('takes the entry the trusted proxy wrote, not a prepended forgery', () => {
    expect(resolveForwardedClient('9.9.9.9, 1.2.3.4', '10.0.0.1', 1)).toBe('1.2.3.4');
    expect(resolveForwardedClient('8.8.8.8, 9.9.9.9, 1.2.3.4', '10.0.0.1', 1)).toBe('1.2.3.4');
  });

  it('handles multiple trusted hops', () => {
    expect(resolveForwardedClient('evil, client, edge1', undefined, 2)).toBe('client');
  });

  it('falls back to the socket when the header is shorter than the trusted chain', () => {
    expect(resolveForwardedClient('1.2.3.4', '10.0.0.1', 2)).toBe('10.0.0.1');
  });

  it('falls back to a constant when nothing identifies the client', () => {
    expect(resolveForwardedClient(undefined, undefined, 1)).toBe('unknown');
  });
});

describe('isLoopback', () => {
  it('recognises the container healthcheck source', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('203.0.113.9')).toBe(false);
  });
});

describe('buildUpstreamHeaders', () => {
  // The load-bearing assertion for the whole rate limiter. Ponder only ever sees connections
  // from this process over loopback, so without an authoritative X-Forwarded-For its
  // resolveClientKey buckets EVERY client under 127.0.0.1 and 120 req/min 429s the world.
  it('writes a single authoritative X-Forwarded-For', () => {
    const out = buildUpstreamHeaders({ host: 'indexer.test' }, '203.0.113.9');
    expect(out['x-forwarded-for']).toBe('203.0.113.9');
  });

  // Replacing, not appending: an appended list still contains attacker-controlled entries and
  // forces the downstream limiter to guess how many hops to trust.
  it('overwrites a client-supplied X-Forwarded-For rather than appending to it', () => {
    const out = buildUpstreamHeaders({ 'x-forwarded-for': 'evil, evil2' }, '203.0.113.9');
    expect(out['x-forwarded-for']).toBe('203.0.113.9');
  });

  it('strips hop-by-hop headers', () => {
    const out = buildUpstreamHeaders(
      {
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        upgrade: 'websocket',
        te: 'trailers',
        'proxy-authorization': 'Basic xyz',
        accept: 'application/json',
      },
      '203.0.113.9'
    );
    expect(Object.keys(out).sort()).toEqual(['accept', 'x-forwarded-for']);
  });

  // `Connection: foo` marks `foo` hop-by-hop for this message only.
  it('strips headers named in the Connection token list', () => {
    const out = buildUpstreamHeaders(
      { connection: 'x-custom-hop', 'x-custom-hop': 'drop me', accept: '*/*' },
      '203.0.113.9'
    );
    expect(out).not.toHaveProperty('x-custom-hop');
    expect(out.accept).toBe('*/*');
  });

  it('preserves ordinary end-to-end headers', () => {
    const out = buildUpstreamHeaders(
      { authorization: 'Bearer x', 'content-type': 'application/json' },
      '203.0.113.9'
    );
    expect(out.authorization).toBe('Bearer x');
    expect(out['content-type']).toBe('application/json');
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit then reports limited', () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 1000, now: () => 0 });
    expect(limiter.check('a').limited).toBe(false);
    expect(limiter.check('a').limited).toBe(false);
    expect(limiter.check('a').limited).toBe(true);
  });

  it('buckets clients independently', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check('a').limited).toBe(false);
    expect(limiter.check('b').limited).toBe(false);
  });

  it('resets after the window', () => {
    let clock = 0;
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000, now: () => clock });
    expect(limiter.check('a').limited).toBe(false);
    expect(limiter.check('a').limited).toBe(true);
    clock += 1001;
    expect(limiter.check('a').limited).toBe(false);
  });

  // The eviction path is the limiter's own memory-exhaustion defence: one bucket per source
  // address, and IPv6 supplies unlimited distinct addresses.
  it('evicts oldest buckets rather than growing without bound', () => {
    let clock = 0;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 10_000,
      maxTrackedClients: 3,
      now: () => clock,
    });
    for (let i = 0; i < 50; i++) {
      clock += 1;
      limiter.check(`client-${i}`);
    }
    // Overflow can only ever forgive requests, never manufacture a 429: the earliest client's
    // bucket has been dropped, so it gets a fresh allowance rather than a limit.
    expect(limiter.check('client-0').limited).toBe(false);
  });

  it('is disabled when max is 0', () => {
    const limiter = createRateLimiter({ maxRequests: 0, windowMs: 1000, now: () => 0 });
    for (let i = 0; i < 100; i++) expect(limiter.check('a').limited).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// END TO END THROUGH THE PROXY
// ═══════════════════════════════════════════════════════════════════════════

interface Hit {
  url: string;
  headers: http.IncomingHttpHeaders;
}

describe('gateway server', () => {
  let upstream: http.Server;
  let gateway: http.Server;
  let gatewayPort: number;
  const upstreamHits: Hit[] = [];

  beforeAll(async () => {
    // Stand in for ponder: answers everything, and records what reached it. If /metrics ever
    // appears in `upstreamHits`, the block leaked.
    upstream = http.createServer((req, res) => {
      upstreamHits.push({ url: req.url ?? '', headers: req.headers });
      res.writeHead(200, { 'Content-Type': 'text/plain', 'X-From': 'upstream' });
      res.end(`upstream:${req.method}:${req.url}`);
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;

    gateway = createGatewayServer({
      upstreamPort,
      metricsToken: 's3cret',
      // The e2e client connects from loopback, which the infrastructure-path limiter exempts
      // (the container HEALTHCHECK must never be the thing that trips it). Limiting is
      // covered separately below with the exemption disabled.
      limitedPaths: [],
    });
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

  // The token is a metrics escape hatch, not a skeleton key. An operator who adds another path
  // to INDEXER_BLOCKED_PATHS must not be silently granting the monitoring credential access to
  // it as well.
  it('does not let the metrics token unlock other blocked paths', async () => {
    const upstreamPort = (upstream.address() as AddressInfo).port;
    const strict = createGatewayServer({
      upstreamPort,
      blockedPaths: ['/metrics', '/status'],
      limitedPaths: [],
      metricsToken: 's3cret',
    });
    await new Promise<void>((resolve) => strict.listen(0, '127.0.0.1', resolve));
    const port = (strict.address() as AddressInfo).port;

    const blocked = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: { authorization: 'Bearer s3cret' },
    });
    const allowed = await fetch(`http://127.0.0.1:${port}/metrics`, {
      headers: { authorization: 'Bearer s3cret' },
    });

    expect(blocked.status).toBe(404);
    expect(allowed.status).toBe(200);
    await new Promise<void>((resolve) => strict.close(() => resolve()));
  });

  it('forwards an authoritative X-Forwarded-For and strips hop-by-hop headers', async () => {
    upstreamHits.length = 0;
    await fetch(`http://127.0.0.1:${gatewayPort}/graphql`, {
      headers: { 'x-forwarded-for': 'evil-forgery' },
    });

    expect(upstreamHits).toHaveLength(1);
    const seen = upstreamHits[0]!.headers;
    // Whatever the client claimed is gone; ponder sees the address we observed.
    expect(seen['x-forwarded-for']).not.toContain('evil-forgery');
    expect(seen['x-forwarded-for']).toBe('127.0.0.1');
    expect(seen).not.toHaveProperty('keep-alive');
  });

  it('returns 502 rather than hanging when the indexer is down', async () => {
    const orphan = createGatewayServer({ upstreamPort: 1 });
    await new Promise<void>((resolve) => orphan.listen(0, '127.0.0.1', resolve));
    const port = (orphan.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/graphql`);
    expect(response.status).toBe(502);
    await new Promise<void>((resolve) => orphan.close(() => resolve()));
  });

  // Distinct from "down". An upstream that ACCEPTS the connection and never answers is the
  // realistic failure (exhausted database pool), and without a timeout it pins the client
  // socket and the upstream socket forever until the container runs out of descriptors.
  it('returns 502 when the indexer accepts the connection but never answers', async () => {
    const blackhole = http.createServer(() => {
      /* deliberately never responds */
    });
    await new Promise<void>((resolve) => blackhole.listen(0, '127.0.0.1', resolve));
    const blackholePort = (blackhole.address() as AddressInfo).port;

    const hung = createGatewayServer({ upstreamPort: blackholePort, upstreamTimeoutMs: 250 });
    await new Promise<void>((resolve) => hung.listen(0, '127.0.0.1', resolve));
    const port = (hung.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/graphql`);
    expect(response.status).toBe(502);

    await new Promise<void>((resolve) => hung.close(() => resolve()));
    blackhole.closeAllConnections();
    await new Promise<void>((resolve) => blackhole.close(() => resolve()));
  });

  // Never echo the upstream error: "connect ECONNREFUSED 127.0.0.1:42070" names the internal
  // port this whole process exists to keep off the public surface.
  it('does not leak the internal upstream address in the 502 body', async () => {
    const orphan = createGatewayServer({ upstreamPort: 1 });
    await new Promise<void>((resolve) => orphan.listen(0, '127.0.0.1', resolve));
    const port = (orphan.address() as AddressInfo).port;
    const body = await (await fetch(`http://127.0.0.1:${port}/graphql`)).text();

    expect(body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|:\d{4,5}/);
    await new Promise<void>((resolve) => orphan.close(() => resolve()));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE PATH RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `/health`, `/ready` and `/status` are ponder's own routes: registered before our app is
 * mounted and returning without calling next, so the CORS and rate-limit middleware in
 * src/api/security.ts cannot see them (test/security.test.ts documents that). `/ready` and
 * `/status` each run a SELECT per request, so left ungated they are an unmetered path to the
 * same connection pool the GraphQL API uses — the application rate limit sidestepped entirely.
 * The gateway is the only layer that can see them.
 */
describe('gateway rate limits the ungatable ponder paths', () => {
  let upstream: http.Server;
  let gateway: http.Server;
  let port: number;

  beforeAll(async () => {
    upstream = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));

    gateway = createGatewayServer({
      upstreamPort: (upstream.address() as AddressInfo).port,
      limitedPathMax: 2,
      limitedPathWindowMs: 60_000,
      // The test client connects over loopback, which production exempts for the container
      // HEALTHCHECK. Trust one hop so the forged header below supplies the identity instead.
      trustProxyHops: 1,
    });
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    port = (gateway.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  const hit = (path: string, client: string) =>
    fetch(`http://127.0.0.1:${port}${path}`, { headers: { 'x-forwarded-for': client } });

  it.each(DEFAULT_LIMITED_PATHS)('limits %s', async (path) => {
    const client = `198.51.100.${DEFAULT_LIMITED_PATHS.indexOf(path) + 1}`;
    expect((await hit(path, client)).status).toBe(200);
    expect((await hit(path, client)).status).toBe(200);

    const limited = await hit(path, client);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('shares one budget across the infrastructure paths per client', async () => {
    const client = '198.51.100.50';
    await hit('/health', client);
    await hit('/ready', client);
    expect((await hit('/status', client)).status).toBe(429);
  });

  it('does not limit the application paths (src/api/security.ts owns those)', async () => {
    const client = '198.51.100.60';
    for (let i = 0; i < 6; i++) {
      expect((await hit('/graphql', client)).status).toBe(200);
    }
  });

  it('buckets clients independently', async () => {
    await hit('/ready', '198.51.100.70');
    await hit('/ready', '198.51.100.70');
    expect((await hit('/ready', '198.51.100.71')).status).toBe(200);
  });

  // Railway's healthcheck and the Dockerfile HEALTHCHECK both poll /ready from inside the
  // container. If the limiter counted those, a deploy would eventually fail health.
  it('exempts loopback so the container HEALTHCHECK never trips it', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(response.status).toBe(200);
    }
  });
});
