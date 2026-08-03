/**
 * Public front door for the indexer (security audit V17 — Medium).
 *
 * WHY THIS PROCESS EXISTS
 *
 * Ponder 0.16.1 builds its own Hono chain and mounts `src/api/index.ts` LAST:
 *
 *   new Hono()
 *     .use(metricsMiddleware)
 *     .use(cors({ origin: '*' }))
 *     .get('/metrics', ...) .get('/health', ...) .get('/ready', ...) .get('/status', ...)
 *     .route('/', apiBuild.app)          <-- our CORS + rate limit live in here
 *
 * Those four `.get()` handlers return without calling `next()`, so no application middleware
 * can see them, and `ponder start` has no flag to disable them (`--config --debug
 * --disable-ui --hostname --log-format --log-level --port --root --schema --views-schema
 * --trace`). `/metrics` is a full Prometheus dump — indexing progress, database pool state,
 * per-chain RPC counters — i.e. free reconnaissance for sizing a flood.
 *
 * The audit's original remedy was "block it at the edge", which meant an untracked, untested
 * rule in somebody's Cloudflare console. This is the same control, in the repository: ponder
 * is bound to loopback on an internal port and this process owns the public port, so the
 * block ships and is tested with the code rather than configured beside it.
 *
 * DESIGN NOTES
 *
 *  - Default deny by exact path, after normalisation. `%2f`, a trailing slash, a query string
 *    and mixed case all normalise to the same decision, so `/Metrics/?x=1` is blocked too.
 *  - `/ready` stays reachable but RATE LIMITED: `railway.toml` uses it as the healthcheck
 *    path, and it runs a database query on every request. See INFRASTRUCTURE PATHS below.
 *  - A blocked path returns 404, not 403. 403 confirms the endpoint exists; 404 is what a
 *    scanner would see from a service that never had it.
 *  - `INDEXER_METRICS_TOKEN` optionally re-opens `/metrics` — and ONLY `/metrics` — to a
 *    bearer token, so a real monitoring scrape still works without exposing it publicly.
 *  - No dependencies: node:http only. This runs as PID 1's child in the container and must
 *    not be able to fail at install time.
 *
 * CLIENT IDENTITY (why this process rewrites X-Forwarded-For)
 *
 * Ponder now only ever sees connections from this process over loopback, so its socket
 * address is useless for rate limiting: without the rewrite below every client in the world
 * shares the bucket keyed `127.0.0.1`, and 120 requests/minute in total would 429 the entire
 * service. This process therefore resolves the client itself and writes a SINGLE-entry
 * `X-Forwarded-For` upstream, overwriting whatever the client sent. That makes
 * `resolveClientKey(..., trustProxyHops: 1)` in `src/api/security.ts` an in-repo guarantee
 * rather than an assumption about the hosting provider's proxy behaviour.
 *
 * INFRASTRUCTURE PATHS
 *
 * `/health`, `/ready` and `/status` cannot be gated in-process for the same reason `/metrics`
 * cannot, and `/ready` + `/status` each run a SELECT on every request (ponder
 * server/index.js: `select_ready`, `select_checkpoints`). Left ungated they are an
 * unmetered path to the same database pool the GraphQL API uses — i.e. the application rate
 * limit is trivially sidestepped for database load. They are rate limited here, at the only
 * layer that can see them. Loopback is exempt so the container HEALTHCHECK never trips it.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

/** Paths ponder mounts that must not be publicly reachable. */
export const DEFAULT_BLOCKED_PATHS = ['/metrics'];

/** The only path `INDEXER_METRICS_TOKEN` may unlock. */
export const METRICS_PATH = '/metrics';

/**
 * Ponder-owned paths that stay reachable but must not be unmetered. `/ready` and `/status`
 * both hit the database on every request; `/health` is free but is included so a flood
 * cannot use it to hold sockets for nothing.
 */
export const DEFAULT_LIMITED_PATHS = ['/health', '/ready', '/status'];

export const DEFAULT_PUBLIC_PORT = 42069;
export const DEFAULT_UPSTREAM_PORT = 42070;

/**
 * How long to wait on ponder before giving up on a proxied request.
 *
 * Without this a ponder that accepts the connection and never answers (an exhausted database
 * pool is the realistic case) pins the client socket AND the upstream socket forever, and the
 * container runs out of descriptors instead of returning an error.
 */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;

/** Ceiling on how long a client may take to send headers / a complete request. */
export const DEFAULT_HEADERS_TIMEOUT_MS = 20_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Per-client budget for the ungatable ponder paths. Generous: these are cheap for a real monitor. */
export const DEFAULT_LIMITED_PATH_MAX = 60;
export const DEFAULT_LIMITED_PATH_WINDOW_MS = 60_000;
export const DEFAULT_MAX_TRACKED_CLIENTS = 20_000;

/**
 * Hop-by-hop headers (RFC 9110 §7.6.1) must not be forwarded by a proxy. Forwarding
 * `Transfer-Encoding` / `Content-Length` verbatim while node applies its own framing is the
 * classic request-smuggling setup; node's own server rejects the conflicting pair today, but
 * correctness here should not depend on the upstream catching our mistake.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'proxy-connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Parse `INDEXER_BLOCKED_PATHS` (comma-separated). An explicitly empty value disables
 * blocking entirely — a deliberate choice for a private network deployment, not a default.
 *
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseBlockedPaths(raw) {
  if (raw === undefined) return DEFAULT_BLOCKED_PATHS;
  return raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
    .map((p) => (p.startsWith('/') ? p : `/${p}`));
}

/**
 * Guarantee a leading `/` before concatenating onto the placeholder origin.
 *
 * A proxy may legally receive an absolute-form request target (`GET http://host/x HTTP/1.1`).
 * Concatenated unguarded that would produce `http://placeholderhttp://host/x`; with the slash
 * it becomes a path, which is the conservative reading — the gateway is not an open proxy.
 *
 * @param {string} raw
 * @returns {string}
 */
function prefixSlash(raw) {
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Normalise a request URL to a comparable path.
 *
 * Percent-decoding happens BEFORE comparison so `/%6d%65trics` cannot slip past, dot-segments
 * are resolved so `/foo/../metrics` cannot either, and a trailing slash is stripped so
 * `/metrics/` is the same decision as `/metrics`. A URL that fails to decode is treated as its
 * raw form rather than allowed through.
 *
 * DOT-SEGMENTS ARE THE LOAD-BEARING PART (round-3 review D-1).
 *
 * This function used to compare a string that still contained `..`, while the request it
 * guarded was routed by something that did not. Downstream, `@hono/node-server` rebuilds the
 * request as `new URL(scheme://host + url)`, and the WHATWG URL parser removes dot-segments:
 * `new Request('http://x/foo/../metrics').url === 'http://x/metrics'`. So `GET /foo/../metrics`
 * was not in the blocklist here, proxied through, and ponder served the full Prometheus dump.
 * The same disagreement defeated every operator-added `INDEXER_BLOCKED_PATHS` entry and the
 * `/health|/ready|/status` limiter — and `/x/../status` runs an unmetered database SELECT,
 * which is the precise DoS this process exists to close.
 *
 * Resolving here is only half the fix; `createGatewayServer` must also proxy THIS path rather
 * than `req.url`, so the gateway's decision and ponder's routing cannot disagree again.
 *
 * @param {string | undefined} url
 * @returns {string}
 */
export function normalisePath(url) {
  const raw = (url ?? '/').split('?')[0].split('#')[0];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence — compare the raw form; never fall through to "allow".
  }

  // Resolve `.` / `..` with the same parser the upstream uses. CONCATENATED onto the origin,
  // not resolved against it as a relative reference: `new URL('//metrics', origin)` is a
  // PROTOCOL-RELATIVE url and parses to host `metrics`, path `/` — which would have quietly
  // un-blocked `//metrics`. @hono/node-server concatenates (`${scheme}://${host}${url}`), so
  // this matches it exactly.
  let resolved = decoded;
  try {
    resolved = decodeURIComponent(new URL(`http://placeholder${prefixSlash(decoded)}`).pathname);
  } catch {
    // A path the URL parser rejects (or re-encodes into an undecodable form) is compared as
    // its decoded self. Never fall through to "allow".
  }

  // Collapse repeated slashes and drop a single trailing one (but keep the root "/").
  const collapsed = resolved.replace(/\/{2,}/g, '/').toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

/**
 * The request target to send upstream: dot-segments resolved, query string preserved.
 *
 * The other half of D-1. Forwarding `req.url` verbatim let ponder route a request the gateway
 * had judged as a different path; this sends ponder the SAME resolution the gateway decided on,
 * computed with the same WHATWG parser `@hono/node-server` uses, so the two cannot disagree.
 *
 * Deliberately NOT `normalisePath`'s output: that one is decoded and lowercased for comparison,
 * and neither is safe to put on the wire. Decoding would turn a legitimately-escaped `%3F` in a
 * path segment into a query delimiter, and lowercasing would corrupt any case-sensitive route
 * argument. `URL.pathname` keeps the original encoding and case and only removes `.`/`..`.
 *
 * @param {string | undefined} url
 * @returns {string}
 */
export function resolveUpstreamTarget(url) {
  const raw = url ?? '/';
  try {
    const parsed = new URL(`http://placeholder${prefixSlash(raw)}`);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    // Unparseable target: pass it through untouched. The blocklist decision above was made on
    // the same string, so this cannot open a path the gateway rejected — ponder will fail it.
    return raw;
  }
}

/**
 * @param {string | undefined} url
 * @param {readonly string[]} blockedPaths
 * @returns {boolean}
 */
export function isBlockedPath(url, blockedPaths) {
  return blockedPaths.includes(normalisePath(url));
}

/**
 * Constant-time bearer check for the optional metrics token.
 *
 * @param {string | undefined} header  value of the Authorization header
 * @param {string | undefined} token   configured INDEXER_METRICS_TOKEN
 * @returns {boolean}
 */
export function hasValidMetricsToken(header, token) {
  if (token === undefined || token === '') return false;
  if (header === undefined) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match === null) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  // timingSafeEqual throws on length mismatch, so compare lengths first — the length of a
  // bearer token is not the secret.
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT IDENTITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strip the IPv4-mapped IPv6 prefix node reports on dual-stack sockets, so `::ffff:1.2.3.4`
 * and `1.2.3.4` are one client rather than two buckets.
 *
 * @param {string | undefined} address
 * @returns {string | undefined}
 */
export function normaliseSocketAddress(address) {
  if (address === undefined || address === '') return undefined;
  const lower = address.toLowerCase();
  return lower.startsWith('::ffff:') ? lower.slice(7) : lower;
}

/**
 * Resolve the real client from the socket plus any `X-Forwarded-For` written by proxies we
 * actually trust.
 *
 * `trustProxyHops` counts proxies IN FRONT OF THIS PROCESS. With N of them appending, the
 * client is at `length - N` counting from the left: anything an attacker prepends shifts left,
 * out of the way, and cannot forge the entry our own edge wrote.
 *
 * The default is 0 — trust nothing the client sent. That fails visibly (everyone shares a
 * bucket, 429s appear) rather than silently (an attacker rotates the header and the limiter
 * does nothing), which is the right way round for a control whose failure is otherwise
 * invisible.
 *
 * @param {string | undefined} forwardedFor
 * @param {string | undefined} socketAddress
 * @param {number} trustProxyHops
 * @returns {string}
 */
export function resolveForwardedClient(forwardedFor, socketAddress, trustProxyHops) {
  if (trustProxyHops > 0 && forwardedFor !== undefined) {
    const parts = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const index = parts.length - trustProxyHops;
    if (index >= 0 && index < parts.length) return parts[index].toLowerCase();
    // Fewer entries than trusted hops means the header did not come through the expected
    // chain; fall through to the socket rather than trust an arbitrary entry.
  }
  return socketAddress ?? 'unknown';
}

/** @param {string | undefined} address */
export function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === 'localhost';
}

/**
 * Build the header set to send upstream: hop-by-hop headers removed, and a single
 * authoritative `X-Forwarded-For` that replaces anything the client supplied.
 *
 * Replacing rather than appending is deliberate. Appending would leave attacker-controlled
 * entries in the list and force `src/api/security.ts` to guess how many hops to trust; a
 * single entry we wrote ourselves makes its `trustProxyHops: 1` exactly right in every
 * deployment.
 *
 * @param {Record<string, string | string[] | undefined>} headers
 * @param {string} clientKey
 * @returns {Record<string, string | string[]>}
 */
export function buildUpstreamHeaders(headers, clientKey) {
  const connectionTokens = new Set(
    String(headers.connection ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0)
  );

  /** @type {Record<string, string | string[]>} */
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    // `Connection: foo` marks `foo` hop-by-hop for this message.
    if (connectionTokens.has(lower)) continue;
    if (lower === 'x-forwarded-for') continue;
    out[name] = value;
  }

  out['x-forwarded-for'] = clientKey;
  return out;
}

/**
 * Build the header set to send DOWNSTREAM: the same hop-by-hop strip, on the response leg.
 *
 * `buildUpstreamHeaders` has always done this for the request; the response used to be handed
 * to `res.writeHead(status, upstreamRes.headers)` verbatim, so ponder's `connection`,
 * `keep-alive` and `transfer-encoding` were echoed to the client while node applied its own
 * framing to the same message. Node currently rejects the conflicting pair, which is why this
 * was latent rather than exploitable — but per the reasoning on HOP_BY_HOP_HEADERS, our
 * correctness must not rest on the runtime catching our mistake. A proxy strips hop-by-hop
 * headers in BOTH directions; there is no asymmetry in RFC 9110 §7.6.1 to justify one.
 *
 * `content-length` is deliberately NOT stripped: it is end-to-end, and node reconciles it with
 * the body it actually writes.
 *
 * @param {Record<string, string | string[] | undefined>} headers
 * @returns {Record<string, string | string[]>}
 */
export function buildDownstreamHeaders(headers) {
  const connectionTokens = new Set(
    String(headers.connection ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0)
  );

  /** @type {Record<string, string | string[]>} */
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    // `Connection: foo` marks `foo` hop-by-hop for this message — in either direction.
    if (connectionTokens.has(lower)) continue;
    out[name] = value;
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING (infrastructure paths only)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fixed-window per-client limiter. Deliberately a second, tiny implementation rather than an
 * import of `src/api/security.ts`: this file runs under bare `node` with no build step, and
 * it guards a different (and much smaller) set of paths.
 *
 * @param {{ maxRequests: number, windowMs: number, maxTrackedClients?: number, now?: () => number }} options
 */
export function createRateLimiter(options) {
  const { maxRequests, windowMs } = options;
  const maxTrackedClients = options.maxTrackedClients ?? DEFAULT_MAX_TRACKED_CLIENTS;
  const now = options.now ?? (() => Date.now());
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  /** @param {number} currentTime */
  function sweep(currentTime) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
    }
    // Map preserves insertion order, so leading entries are the least recently created.
    if (buckets.size > maxTrackedClients) {
      let excess = buckets.size - maxTrackedClients;
      for (const key of buckets.keys()) {
        if (excess-- <= 0) break;
        buckets.delete(key);
      }
    }
  }

  return {
    /**
     * @param {string} key
     * @returns {{ limited: boolean, retryAfterSeconds: number }}
     */
    check(key) {
      if (maxRequests === 0) return { limited: false, retryAfterSeconds: 0 };

      const currentTime = now();
      let bucket = buckets.get(key);
      if (bucket === undefined || bucket.resetAt <= currentTime) {
        if (buckets.size >= maxTrackedClients) sweep(currentTime);
        bucket = { count: 0, resetAt: currentTime + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;

      return {
        limited: bucket.count > maxRequests,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
      };
    },
  };
}

/**
 * Build the public-facing HTTP server.
 *
 * Exposed separately from `main()` so tests can point it at a stub upstream instead of a real
 * ponder instance.
 *
 * @param {{
 *   upstreamHost?: string,
 *   upstreamPort: number,
 *   blockedPaths?: readonly string[],
 *   limitedPaths?: readonly string[],
 *   metricsToken?: string,
 *   trustProxyHops?: number,
 *   upstreamTimeoutMs?: number,
 *   limitedPathMax?: number,
 *   limitedPathWindowMs?: number,
 *   now?: () => number,
 * }} options
 * @returns {import('node:http').Server}
 */
export function createGatewayServer(options) {
  const upstreamHost = options.upstreamHost ?? '127.0.0.1';
  const blockedPaths = options.blockedPaths ?? DEFAULT_BLOCKED_PATHS;
  const limitedPaths = options.limitedPaths ?? DEFAULT_LIMITED_PATHS;
  const metricsToken = options.metricsToken;
  const trustProxyHops = options.trustProxyHops ?? 0;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;

  const limiter = createRateLimiter({
    maxRequests: options.limitedPathMax ?? DEFAULT_LIMITED_PATH_MAX,
    windowMs: options.limitedPathWindowMs ?? DEFAULT_LIMITED_PATH_WINDOW_MS,
    now: options.now,
  });

  const server = http.createServer((req, res) => {
    const path = normalisePath(req.url);
    const socketAddress = normaliseSocketAddress(req.socket.remoteAddress);
    const forwardedFor =
      typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : undefined;
    const clientKey = resolveForwardedClient(forwardedFor, socketAddress, trustProxyHops);

    // The container HEALTHCHECK (`wget http://localhost:42069/ready`) and nothing else: a
    // loopback socket that did NOT arrive through a proxy. Requiring the header's absence
    // matters — a remote client behind the real edge always has one appended, so it cannot
    // claim the exemption by sending `X-Forwarded-For: 127.0.0.1`.
    const isLocalHealthcheck = isLoopback(socketAddress) && forwardedFor === undefined;

    // Blocked paths. The metrics token unlocks /metrics ONLY — an operator who adds another
    // path to INDEXER_BLOCKED_PATHS must not be silently handing the monitoring token access
    // to it as well.
    if (blockedPaths.includes(path)) {
      const unlocked =
        path === METRICS_PATH && hasValidMetricsToken(req.headers.authorization, metricsToken);
      if (!unlocked) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found\n');
        return;
      }
    }

    // Ponder's own /health, /ready and /status cannot be gated in-process, and two of the
    // three query the database on every request.
    if (limitedPaths.includes(path) && !isLocalHealthcheck) {
      const verdict = limiter.check(clientKey);
      if (verdict.limited) {
        res.writeHead(429, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': String(verdict.retryAfterSeconds),
        });
        res.end('Rate limit exceeded.\n');
        return;
      }
    }

    const upstream = http.request(
      {
        host: upstreamHost,
        port: options.upstreamPort,
        method: req.method,
        // The NORMALISED target, not req.url — see resolveUpstreamTarget (D-1).
        path: resolveUpstreamTarget(req.url),
        headers: buildUpstreamHeaders(req.headers, clientKey),
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, buildDownstreamHeaders(upstreamRes.headers));
        upstreamRes.pipe(res);
      }
    );

    // A ponder that accepts the connection and never answers must not pin sockets forever.
    upstream.setTimeout(upstreamTimeoutMs, () => {
      upstream.destroy(new Error(`Upstream timed out after ${upstreamTimeoutMs}ms`));
    });

    upstream.on('error', (error) => {
      // The message names the internal host and port ("connect ECONNREFUSED 127.0.0.1:42070"),
      // which is precisely what this process exists to keep off the public surface. Log it;
      // return a fixed string.
      console.error(`[gateway] upstream error for ${req.method} ${req.url}: ${error.message}`);
      if (res.headersSent) {
        // The body is already partially written — appending prose would corrupt it, and the
        // client must not be told a truncated response was complete.
        res.destroy();
        return;
      }
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Upstream unavailable\n');
    });

    // If the client hangs up mid-request, do not leave the upstream socket held open.
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });

  // Slowloris ceilings. Node's defaults are generous and this process is the public surface.
  server.headersTimeout = DEFAULT_HEADERS_TIMEOUT_MS;
  server.requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS;

  return server;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Supervise ponder on the internal port and serve the filtered public port.
 *
 * Exit semantics are deliberate: if either half dies the whole container dies, so Railway's
 * restart policy restarts a clean pair. A gateway still answering 200s in front of a dead
 * indexer, or an unfiltered ponder still listening after the gateway crashed, are both worse
 * than a restart.
 */
function main() {
  const publicPort = readPort(process.env.PORT, DEFAULT_PUBLIC_PORT);
  const upstreamPort = readPort(process.env.INDEXER_UPSTREAM_PORT, DEFAULT_UPSTREAM_PORT);

  if (publicPort === upstreamPort) {
    console.error(
      `[gateway] PORT and INDEXER_UPSTREAM_PORT are both ${publicPort}. ` +
        'They must differ — the gateway binds the public port and ponder binds the internal one.'
    );
    process.exit(1);
  }

  const blockedPaths = parseBlockedPaths(process.env.INDEXER_BLOCKED_PATHS);
  const trustProxyHops = readNonNegativeInt(process.env.INDEXER_TRUST_PROXY_HOPS, 0);
  const schema = process.env.PONDER_SCHEMA ?? 'swr_prod';
  const ponderBin = fileURLToPath(new URL('./node_modules/.bin/ponder', import.meta.url));

  const child = spawn(
    ponderBin,
    [
      'start',
      '--schema',
      schema,
      // Loopback only: the whole point is that nothing but this gateway can reach ponder.
      '--hostname',
      '127.0.0.1',
      '--port',
      String(upstreamPort),
    ],
    { stdio: 'inherit', env: process.env }
  );

  child.on('error', (error) => {
    console.error(`[gateway] failed to start ponder: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    console.error(`[gateway] ponder exited (code=${code} signal=${signal}); shutting down.`);
    process.exit(code ?? 1);
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  const server = createGatewayServer({
    upstreamPort,
    blockedPaths,
    trustProxyHops,
    metricsToken: process.env.INDEXER_METRICS_TOKEN,
  });

  server.listen(publicPort, '0.0.0.0', () => {
    console.log(
      `[gateway] listening on 0.0.0.0:${publicPort} -> 127.0.0.1:${upstreamPort}; ` +
        `blocked: ${blockedPaths.join(', ') || '(none)'}; ` +
        `rate limited: ${DEFAULT_LIMITED_PATHS.join(', ')}; ` +
        `trusted proxies in front: ${trustProxyHops}`
    );
    if (trustProxyHops === 0) {
      console.log(
        '[gateway] INDEXER_TRUST_PROXY_HOPS=0: X-Forwarded-For from clients is ignored and ' +
          'the socket address identifies the client. Behind a proxy (Railway terminates TLS ' +
          'in front of this process) set it to the number of proxies, or every client will ' +
          'share one rate-limit bucket. See DEPLOY.md.'
      );
    }
  });
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function readPort(raw, fallback) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function readNonNegativeInt(raw, fallback) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

// Only supervise when executed directly; importing this file (tests) must have no side effects.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
