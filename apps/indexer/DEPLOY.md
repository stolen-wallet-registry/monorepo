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

## Monitoring

- Health check: `GET /ready`
- GraphQL playground: `GET /graphql` (in browser)
- Railway dashboard shows logs and resource usage
