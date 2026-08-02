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
 *  - `/ready` stays reachable: `railway.toml` uses it as the healthcheck path.
 *  - A blocked path returns 404, not 403. 403 confirms the endpoint exists; 404 is what a
 *    scanner would see from a service that never had it.
 *  - `INDEXER_METRICS_TOKEN` optionally re-opens `/metrics` to a bearer token, so a real
 *    monitoring scrape still works without exposing it to the internet.
 *  - No dependencies: node:http only. This runs as PID 1's child in the container and must
 *    not be able to fail at install time.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

/** Paths ponder mounts that must not be publicly reachable. */
export const DEFAULT_BLOCKED_PATHS = ['/metrics'];

export const DEFAULT_PUBLIC_PORT = 42069;
export const DEFAULT_UPSTREAM_PORT = 42070;

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
 * Normalise a request URL to a comparable path.
 *
 * Percent-decoding happens BEFORE comparison so `/%6d%65trics` cannot slip past, and a
 * trailing slash is stripped so `/metrics/` is the same decision as `/metrics`. A URL that
 * fails to decode is treated as its raw form rather than allowed through.
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
  // Collapse repeated slashes and drop a single trailing one (but keep the root "/").
  const collapsed = decoded.replace(/\/{2,}/g, '/').toLowerCase();
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
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

/**
 * Build the public-facing HTTP server.
 *
 * Exposed separately from `main()` so tests can point it at a stub upstream instead of a real
 * ponder instance.
 *
 * @param {{ upstreamHost?: string, upstreamPort: number, blockedPaths?: readonly string[], metricsToken?: string }} options
 * @returns {import('node:http').Server}
 */
export function createGatewayServer(options) {
  const upstreamHost = options.upstreamHost ?? '127.0.0.1';
  const blockedPaths = options.blockedPaths ?? DEFAULT_BLOCKED_PATHS;
  const metricsToken = options.metricsToken;

  return http.createServer((req, res) => {
    if (
      isBlockedPath(req.url, blockedPaths) &&
      !hasValidMetricsToken(req.headers.authorization, metricsToken)
    ) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found\n');
      return;
    }

    const upstream = http.request(
      {
        host: upstreamHost,
        port: options.upstreamPort,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    upstream.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(`Upstream unavailable: ${error.message}\n`);
    });

    // If the client hangs up mid-request, do not leave the upstream socket held open.
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
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
    metricsToken: process.env.INDEXER_METRICS_TOKEN,
  });

  server.listen(publicPort, '0.0.0.0', () => {
    console.log(
      `[gateway] listening on 0.0.0.0:${publicPort} -> 127.0.0.1:${upstreamPort}; ` +
        `blocked: ${blockedPaths.join(', ') || '(none)'}`
    );
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

// Only supervise when executed directly; importing this file (tests) must have no side effects.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
