import type { Context, MiddlewareHandler, Next } from 'hono';

/**
 * HTTP hardening for the public indexer surface (security audit V17 — Medium).
 *
 * Ponder builds its own Hono chain and mounts this app LAST:
 *
 *   new Hono()
 *     .use(metricsMiddleware)
 *     .use(cors({ origin: '*', maxAge: 86400 }))   <-- ponder's, not ours
 *     .get('/metrics', ...) .get('/health', ...) .get('/ready', ...) .get('/status', ...)
 *     .route('/', apiBuild.app)                    <-- this app
 *
 * Two consequences drive the design here, both verified against ponder 0.16.1 by replaying
 * that exact chain through `Hono.request()`:
 *
 *  1. Ponder sets `Access-Control-Allow-Origin: *` BEFORE calling next, so simply adding
 *     `hono/cors` here is not enough. Hono's cors only *sets* the header when an origin is
 *     allowed; when it is denied it writes nothing, which would leave ponder's `*` standing
 *     and silently defeat the whole restriction. `enforceCors` therefore runs after next and
 *     explicitly DELETES the header on a denied origin.
 *
 *  2. `/metrics`, `/health`, `/ready` and `/status` are matched by ponder's own handlers,
 *     which are registered before this app and return without calling next. They never reach
 *     this middleware, so nothing here can gate or rate-limit them. See DEPLOY.md — that has
 *     to be enforced at the edge.
 *
 * A third consequence, which the description above used to gloss over: `enforceCors` never
 * runs on a CORS PREFLIGHT. Hono's `cors()` answers `OPTIONS` itself with a 204 and returns
 * WITHOUT calling next (hono/cors: the preflight branch builds its own Response), so ponder's
 * `Access-Control-Allow-Origin: *` stands on every preflight and nothing here can strip it.
 *
 * The control still holds, and it is worth being precise about why, because the reasoning is
 * what stops someone "simplifying" the post-next delete on the assumption preflight is
 * covered. A preflight is only ever a question about a request the browser has not made yet;
 * the browser re-checks the ACTUAL response's `Access-Control-Allow-Origin` before handing any
 * of it to script, and that response DOES pass through this middleware and does get the header
 * deleted. So a denied origin can learn "the preflight said yes" and still read nothing. There
 * is a preflight test in security.test.ts pinning both halves of that.
 *
 * Deleting the header on preflights too would need the gateway or the edge, not this app.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dev servers that legitimately call the indexer from a browser: Vite (apps/web),
 * the landing app, and Storybook. Used only when INDEXER_ALLOWED_ORIGINS is unset, so a
 * local checkout works with no configuration while a deployment must state its origins.
 */
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:6006',
];

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DEV_ORIGINS;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Restrict CORS to configured origins.
 *
 * `INDEXER_ALLOWED_ORIGINS` is a comma-separated allowlist. The literal value `*` re-opens the
 * API to every origin — it is honoured, because a fully public read-only indexer is a
 * legitimate deployment choice, but it now has to be chosen on purpose rather than inherited
 * as a default.
 *
 * Note that CORS is a browser-enforced control: it stops a page on evil.example from READING
 * the response, and does nothing about curl or a server-side flood. Rate limiting below is
 * what addresses volume.
 */
export function enforceCors(allowedOrigins: string[]): MiddlewareHandler {
  const allowAll = allowedOrigins.includes('*');
  const allowed = new Set(allowedOrigins);

  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    await next();

    // Always vary on Origin: the same URL yields different CORS headers per origin, and a
    // shared cache must not serve one origin's response to another.
    c.res.headers.append('Vary', 'Origin');

    if (allowAll) {
      c.res.headers.set('Access-Control-Allow-Origin', '*');
      return;
    }

    if (origin !== undefined && allowed.has(origin)) {
      c.res.headers.set('Access-Control-Allow-Origin', origin);
      return;
    }

    // Deny. Deleting rather than skipping is load-bearing — ponder already wrote `*`.
    c.res.headers.delete('Access-Control-Allow-Origin');
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sustained requests allowed per client per window.
 *
 * 120/minute is 2/second sustained. A dashboard load issues a handful of GraphQL queries and
 * a @swr/search lookup a few more, so a real user stays an order of magnitude under this even
 * while clicking around; a flood aimed at exhausting the database sits far above it. Set
 * INDEXER_RATE_LIMIT_MAX=0 to disable.
 */
const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Ceiling on distinct clients tracked at once. Without it the limiter is itself a memory
 * exhaustion vector: one bucket per source address, and IPv6 supplies effectively unlimited
 * distinct addresses. On overflow the oldest buckets are dropped, which can only ever forgive
 * requests, never manufacture a 429.
 */
const DEFAULT_MAX_TRACKED_CLIENTS = 20_000;

/**
 * Trusted `X-Forwarded-For` hops in front of ponder. Fixed at 1, not configurable, because
 * exactly one thing is ever in front of ponder: `gateway.mjs`, which binds the public port,
 * runs ponder on loopback, and OVERWRITES `X-Forwarded-For` with a single authoritative entry
 * before proxying (see its CLIENT IDENTITY section).
 *
 * This used to be `INDEXER_TRUST_PROXY_HOPS`, which was a footgun in both directions: too low
 * and every client shared the `127.0.0.1` bucket, too high and `resolveClientKey` fell back to
 * that same bucket. The gateway now owns that variable — it counts proxies in front of the
 * GATEWAY — and the count seen here is a repository-level invariant instead of a deployment
 * guess.
 *
 * `pnpm start:ponder-unfiltered` runs ponder with no gateway; it is a local debugging script
 * and is documented as unsafe to deploy.
 */
const GATEWAY_TRUST_PROXY_HOPS = 1;

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  maxTrackedClients: number;
  /** Number of trusted proxies appending to X-Forwarded-For. 0 = ignore the header entirely. */
  trustProxyHops: number;
  /** Injected in tests so windows can be stepped deterministically. */
  now?: () => number;
}

export function readRateLimitOptions(env: NodeJS.ProcessEnv): RateLimitOptions {
  return {
    // Only `maxRequests` may be 0 — that is the documented "disable" switch. A 0 window or a
    // 0 client ceiling would silently disable the limiter instead (every request would land in
    // a freshly expired bucket), which is exactly the kind of quiet failure a typo should not
    // be able to cause.
    maxRequests: readInt(env.INDEXER_RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS, { allowZero: true }),
    windowMs: readInt(env.INDEXER_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    maxTrackedClients: readInt(env.INDEXER_RATE_LIMIT_MAX_TRACKED, DEFAULT_MAX_TRACKED_CLIENTS),
    trustProxyHops: GATEWAY_TRUST_PROXY_HOPS,
  };
}

function readInt(
  raw: string | undefined,
  fallback: number,
  { allowZero = false }: { allowZero?: boolean } = {}
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < (allowZero ? 0 : 1)) return fallback;
  return parsed;
}

/**
 * Identify the client for rate-limiting purposes.
 *
 * X-Forwarded-For is client-controlled in general, so it is only consulted for the number of
 * hops we actually trust. With N trusted proxies appending, the real client is at
 * `length - N` counting from the left: anything an attacker prepends shifts left, out of the
 * way, and cannot forge the entry our own proxy wrote.
 *
 * In this deployment N is 1 and that one hop is `gateway.mjs`, which REPLACES the header with
 * a single entry it computed from the socket (see GATEWAY_TRUST_PROXY_HOPS above). So the
 * header reaching here is not client-controlled at all — `parts.length - 1` is index 0, the
 * value the gateway wrote.
 *
 * The socket fallback is a last resort only. Under the gateway it is always `127.0.0.1`, i.e.
 * one bucket for the whole world, so reaching it means something upstream is misconfigured.
 */
export function resolveClientKey(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  trustProxyHops: number
): string {
  if (trustProxyHops > 0 && forwardedFor !== undefined) {
    const parts = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const index = parts.length - trustProxyHops;
    if (index >= 0 && index < parts.length) return parts[index]!;
    // Fewer entries than trusted hops means the header did not come through the expected
    // chain; fall through to the socket rather than trust an arbitrary entry.
  }
  return socketAddress ?? 'unknown';
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window per-client rate limiter, in-memory and dependency-free.
 *
 * Known limits, both acceptable for the goal of blunting a flood rather than metering an API:
 * a client can burst up to 2x max across a window boundary, and the state is per-process, so
 * running multiple replicas multiplies the effective limit.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { maxRequests, windowMs, maxTrackedClients, trustProxyHops } = options;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  function sweep(currentTime: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
    }
    // Map preserves insertion order, so the leading entries are the least recently created.
    if (buckets.size > maxTrackedClients) {
      const excess = buckets.size - maxTrackedClients;
      let dropped = 0;
      for (const key of buckets.keys()) {
        if (dropped++ >= excess) break;
        buckets.delete(key);
      }
    }
  }

  return async (c: Context, next: Next) => {
    if (maxRequests === 0) return next();

    const currentTime = now();
    const socketAddress = getSocketAddress(c);
    const key = resolveClientKey(c.req.header('x-forwarded-for'), socketAddress, trustProxyHops);

    let bucket = buckets.get(key);
    if (bucket === undefined || bucket.resetAt <= currentTime) {
      if (buckets.size >= maxTrackedClients) sweep(currentTime);
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, maxRequests - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));

    if (bucket.count > maxRequests) {
      // 429 with Retry-After so a well-behaved client backs off instead of hot-looping.
      c.res = new Response('Rate limit exceeded.', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'Retry-After': String(retryAfterSeconds),
          'RateLimit-Limit': String(maxRequests),
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': String(retryAfterSeconds),
        },
      });
      return;
    }

    await next();

    c.res.headers.set('RateLimit-Limit', String(maxRequests));
    c.res.headers.set('RateLimit-Remaining', String(remaining));
    c.res.headers.set('RateLimit-Reset', String(retryAfterSeconds));
  };
}

/** Best-effort socket address from the @hono/node-server request ponder runs under. */
function getSocketAddress(c: Context): string | undefined {
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  return incoming?.socket?.remoteAddress;
}
