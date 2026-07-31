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
| `INDEXER_RATE_LIMIT_WINDOW_MS`   | `60000`                      | Rate limit window.                                          |
| `INDEXER_TRUST_PROXY_HOPS`       | `1`                          | Trusted proxies appending to `X-Forwarded-For`.             |
| `INDEXER_RATE_LIMIT_MAX_TRACKED` | `20000`                      | Client buckets held in memory.                              |

**Set `INDEXER_ALLOWED_ORIGINS` on every deployment.** The default only covers local dev, so a
deployed indexer with this unset will refuse CORS to your actual frontend:

```bash
railway variables set INDEXER_ALLOWED_ORIGINS="https://your-app.vercel.app"
```

`INDEXER_TRUST_PROXY_HOPS=1` is correct for Railway, which terminates TLS in front of the
process. If you put another proxy (Cloudflare, a load balancer) in front of Railway, raise it to
match, or every client will share one rate-limit bucket — or worse, a client-supplied
`X-Forwarded-For` will be trusted.

### `/metrics` must be blocked at the edge

Ponder registers `/metrics`, `/health`, `/ready` and `/status` on its own Hono instance
**before** mounting `src/api/index.ts`, and those handlers return without calling `next`. They
are therefore unreachable from application middleware: the CORS restriction and the rate limit
above do **not** apply to them, and ponder 0.16.1 has no flag to disable them (`ponder start`
exposes only `--config --debug --disable-ui --hostname --log-format --log-level --port --root
--schema --views-schema --trace`).

`/metrics` is a full Prometheus dump — indexing progress, database pool state, per-chain RPC
counters. It is free reconnaissance for sizing a flood and should not be publicly reachable.
Block it in front of the service:

- **Railway / Cloudflare:** add a WAF or redirect rule denying `/metrics` (and `/status` if you
  do not need it public) for all sources except your monitoring egress.
- **Self-hosted reverse proxy:** `location = /metrics { deny all; }`, or restrict by source IP.

Leave `/ready` reachable — `railway.toml` uses it as the healthcheck path.

There is a test in `test/security.test.ts` (`V17 — ponder routes this app cannot reach`) that
documents this bypass. If a future ponder release lets user middleware intercept these routes,
that test will fail, and this section can be replaced with real in-process enforcement.

## Monitoring

- Health check: `GET /ready`
- GraphQL playground: `GET /graphql` (in browser)
- Railway dashboard shows logs and resource usage
