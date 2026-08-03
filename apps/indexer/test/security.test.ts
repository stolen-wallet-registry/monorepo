import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  enforceCors,
  parseAllowedOrigins,
  rateLimit,
  readRateLimitOptions,
  resolveClientKey,
} from '../src/api/security.js';

/**
 * Rebuild ponder 0.16.1's actual server chain around our app.
 *
 * This is the whole point of these tests: our middleware runs INSIDE a chain that has already
 * set `Access-Control-Allow-Origin: *`, so testing our app in isolation would pass while the
 * real deployment stayed wide open.
 *
 * Mirrors ponder/dist/esm/server/index.js.
 */
function buildPonderChain(app: Hono) {
  return new Hono()
    .use(cors({ origin: '*', maxAge: 86400 }))
    .get('/metrics', (c) => c.text('ponder_indexing_completed_events 1234'))
    .get('/health', (c) => c.text('', 200))
    .get('/status', (c) => c.json({ base: { id: 8453 } }))
    .route('/', app);
}

function buildApp(options?: {
  origins?: string[];
  rateLimitMax?: number;
  now?: () => number;
}): Hono {
  const app = new Hono();
  app.use('*', enforceCors(options?.origins ?? ['https://app.example']));
  app.use(
    '*',
    rateLimit({
      maxRequests: options?.rateLimitMax ?? 1000,
      windowMs: 60_000,
      maxTrackedClients: 100,
      trustProxyHops: 1,
      now: options?.now,
    })
  );
  // async to match Hono's MiddlewareHandler contract (Promise<void | Response>), which is
  // also what the real `graphql({ db, schema })` middleware this stands in for returns.
  app.use('/graphql', async (c) => c.json({ data: { ok: true } }));
  return app;
}

const request = (chain: Hono, path: string, init?: RequestInit) =>
  chain.request(`http://indexer.test${path}`, init);

describe('V17 — CORS is restricted despite ponder pre-setting *', () => {
  it('echoes an allowed origin', async () => {
    const chain = buildPonderChain(buildApp());
    const res = await request(chain, '/graphql', { headers: { origin: 'https://app.example' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  // The load-bearing assertion. Hono's own cors() writes nothing when it denies an origin,
  // which would leave ponder's `*` in place — this proves we actively remove it.
  it("strips ponder's wildcard for a disallowed origin", async () => {
    const chain = buildPonderChain(buildApp());
    const res = await request(chain, '/graphql', { headers: { origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sends no allow-origin when the request has no Origin header', async () => {
    const chain = buildPonderChain(buildApp());
    const res = await request(chain, '/graphql');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('always sets Vary: Origin so caches cannot cross-serve', async () => {
    const chain = buildPonderChain(buildApp());
    const res = await request(chain, '/graphql', { headers: { origin: 'https://evil.example' } });
    expect(res.headers.get('vary')).toMatch(/Origin/);
  });

  it('honours an explicit "*" allowlist as a deliberate opt-in', async () => {
    const chain = buildPonderChain(buildApp({ origins: ['*'] }));
    const res = await request(chain, '/graphql', { headers: { origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  // ─── Preflights never reach this middleware, and that is survivable — but only for a
  // reason worth pinning down. Hono's cors() answers OPTIONS itself and returns without
  // calling next, so ponder's `*` stands on the preflight and enforceCors is never invoked.
  // What makes the control hold is that the browser re-checks the ACTUAL response, which does
  // pass through here. Both halves are asserted so that "preflight says *" can never be read
  // as "the restriction leaks", and so that deleting the post-next strip fails loudly.
  describe('CORS preflight (OPTIONS) is answered upstream of this app', () => {
    const preflight = (chain: Hono, origin: string) =>
      request(chain, '/graphql', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });

    it("leaves ponder's wildcard standing on the preflight of a disallowed origin", async () => {
      const chain = buildPonderChain(buildApp());
      const res = await preflight(chain, 'https://evil.example');

      // Not the behaviour we would choose; it is the behaviour hono/cors produces upstream.
      // Documented here so a future reader does not mistake it for a regression in our code.
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('still denies the disallowed origin on the request that actually carries data', async () => {
      // The load-bearing half. A permissive preflight buys an attacker nothing while this
      // holds: the browser refuses to expose a response whose allow-origin does not match.
      const chain = buildPonderChain(buildApp());
      const res = await request(chain, '/graphql', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      });

      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('leaves an allowed origin working end to end', async () => {
      const chain = buildPonderChain(buildApp());

      const pre = await preflight(chain, 'https://app.example');
      expect(pre.status).toBeLessThan(300);

      const actual = await request(chain, '/graphql', {
        method: 'POST',
        headers: { origin: 'https://app.example', 'content-type': 'application/json' },
      });
      expect(actual.headers.get('access-control-allow-origin')).toBe('https://app.example');
    });
  });

  describe('parseAllowedOrigins', () => {
    it('defaults to local dev origins when unset or blank', () => {
      expect(parseAllowedOrigins(undefined)).toContain('http://localhost:5173');
      expect(parseAllowedOrigins('   ')).toContain('http://localhost:5173');
      // The default must not be a wildcard.
      expect(parseAllowedOrigins(undefined)).not.toContain('*');
    });

    it('splits and trims a comma-separated list', () => {
      expect(parseAllowedOrigins(' https://a.example , https://b.example ')).toEqual([
        'https://a.example',
        'https://b.example',
      ]);
    });
  });
});

describe('V17 — rate limiting', () => {
  it('allows up to the limit then returns 429 with Retry-After', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 3 }));
    const headers = { origin: 'https://app.example', 'x-forwarded-for': '203.0.113.9' };

    for (let i = 0; i < 3; i++) {
      const ok = await request(chain, '/graphql', { headers });
      expect(ok.status).toBe(200);
    }

    const limited = await request(chain, '/graphql', { headers });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  // A browser that cannot read the 429 sees an opaque failure, so CORS headers must survive
  // the short-circuit. This also proves the outer middleware still runs when the inner one
  // replaces c.res without calling next.
  it('429 responses still carry CORS headers for allowed origins', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 1 }));
    const headers = { origin: 'https://app.example', 'x-forwarded-for': '203.0.113.10' };
    await request(chain, '/graphql', { headers });
    const limited = await request(chain, '/graphql', { headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  it('429s do not leak the wildcard to a disallowed origin', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 1 }));
    const headers = { origin: 'https://evil.example', 'x-forwarded-for': '203.0.113.11' };
    await request(chain, '/graphql', { headers });
    const limited = await request(chain, '/graphql', { headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('buckets clients independently', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 1 }));
    const origin = 'https://app.example';
    await request(chain, '/graphql', { headers: { origin, 'x-forwarded-for': '198.51.100.1' } });
    const other = await request(chain, '/graphql', {
      headers: { origin, 'x-forwarded-for': '198.51.100.2' },
    });
    expect(other.status).toBe(200);
  });

  it('resets after the window elapses', async () => {
    let clock = 1_000_000;
    const chain = buildPonderChain(buildApp({ rateLimitMax: 1, now: () => clock }));
    const headers = { origin: 'https://app.example', 'x-forwarded-for': '198.51.100.7' };

    expect((await request(chain, '/graphql', { headers })).status).toBe(200);
    expect((await request(chain, '/graphql', { headers })).status).toBe(429);

    clock += 60_001;
    expect((await request(chain, '/graphql', { headers })).status).toBe(200);
  });

  it('exposes RateLimit-* headers on successful responses', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 10 }));
    const res = await request(chain, '/graphql', {
      headers: { origin: 'https://app.example', 'x-forwarded-for': '198.51.100.8' },
    });
    expect(res.headers.get('ratelimit-limit')).toBe('10');
    expect(res.headers.get('ratelimit-remaining')).toBe('9');
  });

  it('is disabled when max is 0', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 0 }));
    const headers = { origin: 'https://app.example', 'x-forwarded-for': '198.51.100.9' };
    for (let i = 0; i < 50; i++) {
      expect((await request(chain, '/graphql', { headers })).status).toBe(200);
    }
  });
});

describe('V17 — client identification is not spoofable', () => {
  /**
   * The one trusted hop is `gateway.mjs`, which REPLACES X-Forwarded-For with a single entry
   * it derived from the socket before proxying. So in this deployment `parts` has length 1 and
   * index 0 is the gateway's own value — the header reaching here is not client-controlled at
   * all, which is what makes trusting it correct.
   *
   * The multi-entry cases below are defence in depth for a hand-run
   * `start:ponder-unfiltered`: with one appending proxy, anything an attacker prepends shifts
   * left and is ignored.
   */
  it('picks the entry the trusted proxy wrote, not a prepended forgery', () => {
    expect(resolveClientKey('1.2.3.4', '10.0.0.1', 1)).toBe('1.2.3.4');
    expect(resolveClientKey('9.9.9.9, 1.2.3.4', '10.0.0.1', 1)).toBe('1.2.3.4');
    expect(resolveClientKey('8.8.8.8, 9.9.9.9, 1.2.3.4', '10.0.0.1', 1)).toBe('1.2.3.4');
  });

  it('ignores X-Forwarded-For entirely when no proxy is trusted', () => {
    expect(resolveClientKey('1.2.3.4', '10.0.0.1', 0)).toBe('10.0.0.1');
  });

  it('falls back to the socket when the header is shorter than the trusted chain', () => {
    expect(resolveClientKey('1.2.3.4', '10.0.0.1', 2)).toBe('10.0.0.1');
  });

  it('falls back to a constant when nothing identifies the client', () => {
    expect(resolveClientKey(undefined, undefined, 1)).toBe('unknown');
  });

  it('handles multiple trusted hops', () => {
    expect(resolveClientKey('evil, client, edge1', undefined, 2)).toBe('client');
  });
});

describe('V17 — configuration defaults', () => {
  it('uses documented defaults when env is empty', () => {
    const options = readRateLimitOptions({});
    expect(options.maxRequests).toBe(120);
    expect(options.windowMs).toBe(60_000);
    expect(options.trustProxyHops).toBe(1);
  });

  it('reads overrides from env', () => {
    const options = readRateLimitOptions({
      INDEXER_RATE_LIMIT_MAX: '5',
      INDEXER_RATE_LIMIT_WINDOW_MS: '1000',
    });
    expect(options.maxRequests).toBe(5);
    expect(options.windowMs).toBe(1000);
  });

  /**
   * `trustProxyHops` is deliberately NOT configurable here. Exactly one thing is ever in front
   * of ponder — gateway.mjs — and it overwrites X-Forwarded-For with a single entry, so the
   * count is a repository invariant. It used to read INDEXER_TRUST_PROXY_HOPS, which was a
   * footgun in both directions: too low and every client shared the `127.0.0.1` bucket, too
   * high and resolveClientKey fell back to that same bucket. That variable now belongs to the
   * gateway, where it means "proxies in front of the gateway".
   */
  it('ignores INDEXER_TRUST_PROXY_HOPS — the gateway owns that variable now', () => {
    expect(readRateLimitOptions({ INDEXER_TRUST_PROXY_HOPS: '0' }).trustProxyHops).toBe(1);
    expect(readRateLimitOptions({ INDEXER_TRUST_PROXY_HOPS: '7' }).trustProxyHops).toBe(1);
  });

  // A typo'd env var must not silently disable the limiter.
  it('falls back to defaults on malformed values', () => {
    const options = readRateLimitOptions({
      INDEXER_RATE_LIMIT_MAX: 'lots',
      INDEXER_RATE_LIMIT_WINDOW_MS: 'soon',
    });
    expect(options.maxRequests).toBe(120);
    expect(options.windowMs).toBe(60_000);
  });

  /**
   * Only `maxRequests` may be 0 — that is the documented disable switch. A 0 window would
   * silently disable the limiter instead: every request lands in a bucket that already
   * expired, so nothing is ever counted. A typo must not be able to do that quietly.
   */
  it('accepts 0 only for maxRequests, never for the window or the client ceiling', () => {
    expect(readRateLimitOptions({ INDEXER_RATE_LIMIT_MAX: '0' }).maxRequests).toBe(0);
    expect(readRateLimitOptions({ INDEXER_RATE_LIMIT_WINDOW_MS: '0' }).windowMs).toBe(60_000);
    expect(readRateLimitOptions({ INDEXER_RATE_LIMIT_MAX_TRACKED: '0' }).maxTrackedClients).toBe(
      20_000
    );
  });

  it('rejects negative values', () => {
    expect(readRateLimitOptions({ INDEXER_RATE_LIMIT_MAX: '-3' }).maxRequests).toBe(120);
    expect(readRateLimitOptions({ INDEXER_RATE_LIMIT_WINDOW_MS: '-1' }).windowMs).toBe(60_000);
  });
});

/**
 * Documents a real limitation rather than asserting a fix: ponder registers these routes
 * before mounting this app and returns without calling next, so no middleware here can see
 * them. If a future ponder version changes that, these tests flip to red and we can delete
 * the DEPLOY.md edge-blocking guidance.
 */
describe('V17 — ponder routes this app cannot reach', () => {
  it('/metrics bypasses our middleware entirely', async () => {
    const app = buildApp({ rateLimitMax: 1 });
    app.get('/metrics', (c) => c.text('INTERCEPTED'));
    const chain = buildPonderChain(app);

    const res = await request(chain, '/metrics', { headers: { origin: 'https://evil.example' } });
    expect(await res.text()).not.toBe('INTERCEPTED');
    // Still ponder's wildcard, because our CORS middleware never ran.
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('/metrics and /status are not rate limited', async () => {
    const chain = buildPonderChain(buildApp({ rateLimitMax: 1 }));
    const headers = { 'x-forwarded-for': '203.0.113.50' };
    for (let i = 0; i < 5; i++) {
      expect((await request(chain, '/metrics', { headers })).status).toBe(200);
      expect((await request(chain, '/status', { headers })).status).toBe(200);
    }
  });
});
