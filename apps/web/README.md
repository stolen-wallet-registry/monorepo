# SWR Web App

The registry web app for registering stolen wallets and fraudulent transactions, searching indexed data, and viewing the public dashboard.

## Run Locally

From the repo root:

```bash
pnpm dev:web
```

App runs at `http://localhost:5173`.

## Local Contracts (Recommended)

```bash
pnpm anvil
pnpm deploy:dev
```

## Cross-Chain Mode

```bash
pnpm anvil:crosschain
pnpm deploy:crosschain
pnpm dev:crosschain
```

## Common Scripts

```bash
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web storybook
```

## Environment Variables

Copy `apps/web/.env.example` to `apps/web/.env`.

| Variable                        | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect integration (optional)      |
| `VITE_ALCHEMY_API_KEY`          | Transaction history on non-local networks |
| `VITE_CROSSCHAIN`               | Enable cross-chain UI (`true`)            |
| `VITE_TESTNET`                  | Use testnet chains (`true`)               |
| `VITE_RELAY_MULTIADDR`          | Override P2P relay multiaddr              |
| `VITE_APP_ENV`                  | Logging mode: `staging` or `production`   |
| `VITE_HOMEPAGE_URL`             | Link to landing page                      |
| `VITE_DOCS_URL`                 | Link to docs site                         |
