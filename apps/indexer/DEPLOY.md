# Deploying the Indexer to Railway

The Ponder indexer can be deployed to Railway for persistent hosting. This is optional — the web app works without it (dashboard shows fallback states).

## Prerequisites

- [Railway account](https://railway.app)
- Contracts deployed and addresses filled in `@swr/chains`

## Steps

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project (from monorepo root)
railway init
```

### 2. Add PostgreSQL

In the Railway dashboard, add a PostgreSQL plugin to your project. Copy the `DATABASE_URL` connection string.

### 3. Set Environment Variables

```bash
railway variables set DATABASE_URL="postgresql://..."
railway variables set PONDER_ENV=staging
railway variables set PONDER_RPC_URL_84532="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
railway variables set PONDER_START_BLOCK_84532="YOUR_DEPLOYMENT_BLOCK"
```

| Variable                   | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `DATABASE_URL`             | PostgreSQL connection string (from Railway plugin) |
| `PONDER_ENV`               | `staging` or `production`                          |
| `PONDER_RPC_URL_84532`     | Base Sepolia RPC URL (staging)                     |
| `PONDER_RPC_URL_8453`      | Base Mainnet RPC URL (production)                  |
| `PONDER_START_BLOCK_84532` | Block number of contract deployment (staging)      |
| `PONDER_START_BLOCK_8453`  | Block number of contract deployment (production)   |

### 4. Deploy

```bash
railway up
```

Railway will build using the Dockerfile and start the indexer.

### 5. Get Public URL

In the Railway dashboard, go to your service settings and generate a public domain. This gives you a URL like `https://your-service.up.railway.app`.

### 6. Connect Frontend

Set the indexer URL in Vercel:

```bash
VITE_INDEXER_URL=https://your-service.up.railway.app
```

## Expected Cost

~$10-20/month for a staging indexer (PostgreSQL + compute).

## Security configuration

The indexer is a public read-only service, but it should not be an unmetered one. These
variables are read in `src/api/security.ts`.

| Variable                         | Default                      | Purpose                                                     |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `INDEXER_ALLOWED_ORIGINS`        | localhost 5173 / 3000 / 6006 | Comma-separated CORS allowlist. `*` re-opens to any origin. |
| `INDEXER_RATE_LIMIT_MAX`         | `120`                        | Requests per client per window. `0` disables.               |
| `INDEXER_RATE_LIMIT_WINDOW_MS`   | `60000`                      | Rate limit window. Must be > 0.                             |
| `INDEXER_RATE_LIMIT_MAX_TRACKED` | `20000`                      | Client buckets held in memory. Must be > 0.                 |
| `INDEXER_MAX_OFFSET`             | `10000`                      | Largest GraphQL `offset` accepted. `0` allows only `0`.     |

Only `INDEXER_RATE_LIMIT_MAX` and `INDEXER_MAX_OFFSET` accept `0`. For the rate limit that is
the deliberate "disable" switch; for the offset it is a lockdown that fails visibly on the
first paginated request. A `0` window or a `0` client ceiling would silently disable the
limiter instead (every request would land in a bucket that already expired), so those fall back
to their defaults rather than letting a typo quietly turn the control off.

### Query cost — `INDEXER_MAX_OFFSET`

The rate limit meters how MANY requests a client makes, never how expensive one is. Ponder caps
`limit` at 1000 but exposes `offset` with no ceiling, applied as a bare SQL `OFFSET`, and
Postgres reaches an offset by producing and discarding every row before it. graphql-armor does
not help: it inspects a document's shape, never its argument values, and its 30-alias ceiling
means one permitted request can carry thirty of these.

`limitQueryOffset` rejects an over-limit `offset` with `400` before it reaches a resolver,
whether it arrives as a literal, as a variable, or as a variable's default value. Deep paging
past the ceiling is what cursors are for — every plural query also accepts `after`/`before`,
which seek instead of counting.

**Set `INDEXER_ALLOWED_ORIGINS` on every deployment.** The default only covers local dev, so a
deployed indexer with this unset will refuse CORS to your actual frontend:

```bash
railway variables set INDEXER_ALLOWED_ORIGINS="https://your-app.vercel.app"
```

### Client identification — `INDEXER_TRUST_PROXY_HOPS`

**This variable belongs to the gateway, and it counts proxies in front of the GATEWAY.**

Ponder only ever sees connections from `gateway.mjs` over loopback, so its socket address is
useless for rate limiting: without a rewrite, every client on earth shares the bucket keyed
`127.0.0.1` and 120 requests/minute in total would 429 the entire service. The gateway
therefore resolves the client itself and writes a **single-entry** `X-Forwarded-For` upstream,
overwriting whatever the client sent. That makes the one trusted hop inside ponder a property
of this repository rather than an assumption about the host's proxy behaviour — so
`src/api/security.ts` no longer reads this variable at all.

| Deployment                            | Set it to               | Why                                       |
| ------------------------------------- | ----------------------- | ----------------------------------------- |
| `docker run` / bare, nothing in front | `0` (default)           | No proxy writes the header, so ignore it. |
| **Railway** (terminates TLS in front) | `1` (default there)     | Trust the entry Railway's edge appended.  |
| Cloudflare → Railway → gateway        | `2` (must set manually) | Two appending proxies.                    |

```bash
# Only needed to OVERRIDE the defaults, e.g. with Cloudflare in front of Railway:
railway variables set INDEXER_TRUST_PROXY_HOPS=2
```

The default is `0` — trust nothing the client sent — because the two failure modes are not
symmetric. Too low fails **visibly**: clients share a bucket and 429s appear. Too high fails
**invisibly**: an attacker rotates `X-Forwarded-For` per request and the limiter silently does
nothing. The one exception: when `RAILWAY_ENVIRONMENT` is present the gateway defaults to `1`,
because Railway always terminates TLS one hop in front and `0` there guarantees the visible
failure for every client. An explicit `INDEXER_TRUST_PROXY_HOPS` always wins. The gateway logs
the effective value at startup.

### Ponder's own routes are handled by the gateway process (no edge rule needed)

Ponder registers `/metrics`, `/health`, `/ready` and `/status` on its own Hono instance
**before** mounting `src/api/index.ts`, and those handlers return without calling `next`. They
are therefore unreachable from application middleware: the CORS restriction and the rate limit
above do **not** apply to them, and ponder 0.16.1 has no flag to disable them (`ponder start`
exposes only `--config --debug --disable-ui --hostname --log-format --log-level --port --root
--schema --views-schema --trace`).

`/metrics` is blocked outright. The other three stay reachable but are **rate limited at the
gateway**, which is the only layer that can see them — see below.

`/metrics` is a full Prometheus dump — indexing progress, database pool state, per-chain RPC
counters. It is free reconnaissance for sizing a flood.

Because it cannot be gated in-process, **`pnpm start` no longer runs ponder directly.** It runs
`gateway.mjs`, which:

1. binds the public port (`PORT`, default `42069`),
2. spawns `ponder start` bound to **loopback only** on `INDEXER_UPSTREAM_PORT` (default `42070`),
3. proxies everything through, returning `404` for any path in `INDEXER_BLOCKED_PATHS`.

Ponder is not reachable from outside the container, so the block cannot be bypassed by
addressing it directly. Path matching is percent-decoded, case-folded and slash-normalised, so
`/Metrics/`, `/%6d%65trics` and `/metrics?x=1` are all blocked (`test/gateway.test.ts`).

#### `/health`, `/ready` and `/status` are rate limited, not blocked

`/ready` and `/status` each run a database query on **every** request (ponder's `select_ready`
and `select_checkpoints`). Left ungated they are an unmetered path to the same connection pool
the GraphQL API uses — i.e. the application rate limit above, sidestepped entirely for database
load. They cannot be blocked (`railway.toml` and the Dockerfile HEALTHCHECK both poll `/ready`),
so the gateway meters them: **60 requests per client per minute**, shared across the three
paths. A real monitoring scrape is nowhere near that.

The container's own healthcheck is exempt: a loopback socket that did **not** arrive through a
proxy. A remote client always has `X-Forwarded-For` appended by the edge, so it cannot claim the
exemption by sending `X-Forwarded-For: 127.0.0.1`.

| Variable                   | Default              | Purpose                                                                           |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `PORT`                     | `42069`              | Public port the gateway binds.                                                    |
| `INDEXER_UPSTREAM_PORT`    | `42070`              | Loopback port ponder binds. Must differ from `PORT`.                              |
| `INDEXER_BLOCKED_PATHS`    | `/metrics`           | Comma-separated. Explicitly empty (`""`) disables blocking.                       |
| `INDEXER_METRICS_TOKEN`    | unset                | If set, `Authorization: Bearer <token>` reaches `/metrics` — and only `/metrics`. |
| `INDEXER_TRUST_PROXY_HOPS` | `0` (`1` on Railway) | Proxies in front of the gateway (see above).                                      |
| `INDEXER_MAX_BODY_BYTES`   | `1048576` (1 MiB)    | Request body ceiling. Over-size requests get 413 (see below).                     |
| `PONDER_SCHEMA`            | `swr_prod`           | Passed through as `ponder start --schema`.                                        |

### Request body ceiling — `INDEXER_MAX_BODY_BYTES`

Nothing else on the path bounds body size: the application mounts no `bodyLimit`, ponder's own
chain has none, and graphql-armor's `maxOperationTokens` cannot help because yoga has to buffer
the whole body before there is a document to count tokens in. `headersTimeout` and
`requestTimeout` bound how _long_ a client may take, not how much it may send — 60 seconds on a
fast link is hundreds of megabytes buffered in the indexer process, for one token against the
rate limit.

The gateway enforces the ceiling twice: a declared `Content-Length` over the limit is refused
before an upstream socket is opened, and a streaming counter catches a chunked request, which
declares no length at all. Either way the client gets `413` and `Connection: close`. 1 MiB is
far above any legitimate query — the largest document in `packages/search` is a few hundred
bytes.

The gateway also strips hop-by-hop headers, applies a 30s upstream timeout plus Slowloris
ceilings on the public listener, and never echoes upstream error text (it names the internal
port, which is the thing this process exists to hide) — it logs it and returns a fixed `502`.

To let a Prometheus scraper through without exposing the endpoint publicly:

```bash
railway variables set INDEXER_METRICS_TOKEN="$(openssl rand -hex 32)"
# scrape_configs:
#   - job_name: swr-indexer
#     authorization: { type: Bearer, credentials: "<token>" }
#     metrics_path: /metrics
```

If either process dies the container exits and Railway restarts a clean pair — a gateway
answering 200s in front of a dead indexer, or an unfiltered ponder still listening after the
gateway crashed, are both worse than a restart.

`pnpm start:ponder-unfiltered` still exists for local debugging. It binds `0.0.0.0:42069` with
`/metrics` open — **do not use it as a deployment start command.**

There is a test in `test/security.test.ts` (`V17 — ponder routes this app cannot reach`) that
documents the in-process bypass. If a future ponder release lets user middleware intercept
those routes, that test will fail and the gateway can be retired in favour of real in-process
enforcement.

## Monitoring

- Health check: `GET /ready`
- GraphQL playground: `GET /graphql` (in browser)
- Railway dashboard shows logs and resource usage
