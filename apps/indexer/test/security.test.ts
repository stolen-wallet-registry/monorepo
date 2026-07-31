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
  // With one trusted proxy appending, anything the attacker prepends shifts left and is
  // ignored; the entry our own proxy wrote is what counts.
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
      INDEXER_TRUST_PROXY_HOPS: '0',
    });
    expect(options.maxRequests).toBe(5);
    expect(options.windowMs).toBe(1000);
    expect(options.trustProxyHops).toBe(0);
  });

  // A typo'd env var must not silently disable the limiter.
  it('falls back to defaults on malformed values', () => {
    const options = readRateLimitOptions({
      INDEXER_RATE_LIMIT_MAX: 'lots',
      INDEXER_TRUST_PROXY_HOPS: '-3',
    });
    expect(options.maxRequests).toBe(120);
    expect(options.trustProxyHops).toBe(1);
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
