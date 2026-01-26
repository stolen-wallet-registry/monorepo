# Stolen Wallet Registry

A decentralized fraud detection and transparency registry system for Web3. It lets individuals report stolen wallets and fraudulent transactions, and lets approved operators batch-submit malicious contracts, wallets, and transactions. All registries are active and publicly searchable.

## Why This Matters

Crypto fraud victims today have no standardized way to report compromised wallets. Fraud data is siloed across exchanges, scattered in Discord servers, or lost entirely. Meanwhile, attackers move stolen funds through off-ramps that have no way to know a wallet is compromised.

The Stolen Wallet Registry changes this by creating a **public, on-chain source of truth** for fraud data:

- **Victims get agency** — Even with a completely drained wallet, users can register it as stolen through relay mechanisms
- **Exchanges get intelligence** — Off-ramps and wallets can query the registry before processing withdrawals
- **The ecosystem gets transparency** — Fraud patterns become visible, enabling better prevention

This is a public good. The goal is to make Web3 safer for everyone.

## Overview

The Stolen Wallet Registry (SWR) gives crypto fraud victims a way to publicly mark wallets and transactions as compromised, even when access to funds is lost. The registry is on-chain for transparency, and indexed for fast search by off-ramps, wallets, and security teams.

## Key Features

- **Self-attestation with proof of ownership**: Users sign with their wallet to prove control before registering it as stolen.
- **Anti-phishing protection**: Two-phase EIP-712 signing with a randomized grace period prevents single-transaction attacks.
- **Operator batch submissions**: Approved operators can submit large batches using Merkle roots.
- **Public search and dashboard**: Indexed data is searchable and visible in a public dashboard.
- **Cross-chain design**: CAIP-10 compatible registry entries support multi-chain reporting.

## Active Registries

- **Stolen Wallets**: Individuals can self-attest with wallet signatures; operators can batch-submit wallets.
- **Stolen Transactions**: Individuals can report fraudulent transactions; operators can batch-submit transaction batches.
- **Fraudulent Contracts**: Operator-only submissions for malicious contract addresses.

## Registration Methods

1. **Standard** — Sign and pay with the wallet being registered.
2. **Self-Relay** — Sign with the compromised wallet, pay gas from a different wallet.
3. **P2P Relay** — Sign with the compromised wallet, a trusted helper pays gas via libp2p relay.

## Tech Stack

```text
Build:     Vite 7.x, TypeScript 5.9, Turborepo 2.x, pnpm
UI:        React 19, Tailwind CSS 4.x, shadcn/ui, Radix UI
Web3:      wagmi 2.x, viem 2.x, RainbowKit 2.x, TanStack Query 5.x
State:     Zustand 5.x, React Hook Form 7.x, Zod 4.x
Testing:   Vitest 4.x, Storybook 10.x, Testing Library
Contracts: Foundry, Solidity 0.8.24, OpenZeppelin
Indexer:   Ponder + Postgres
```

## Development

Full local development typically includes contracts (Anvil), the web app, and optionally the relay server and indexer.

### Prerequisites

- Node.js 22+
- pnpm 9+
- Foundry (for contracts)
- Postgres (for indexer)

Install dependencies from the repo root:

```bash
pnpm install
```

---

## Environment Setup

Copy the example env files and fill in values as needed:

- Web app: `apps/web/.env.example` → `apps/web/.env`
- Landing site: `apps/landing/.env.example` → `apps/landing/.env.local`
- Indexer: `apps/indexer/.env.local.example` → `apps/indexer/.env.local`
- Contracts: `packages/contracts/.env.example` → `packages/contracts/.env`
- Testnet contracts: `packages/contracts/.env.testnet.example` → `packages/contracts/.env.testnet`

Key env notes:

- `apps/web/.env`:
  - `VITE_WALLETCONNECT_PROJECT_ID` (optional)
  - `VITE_ALCHEMY_API_KEY` (required for transaction history on non-local networks)
  - `VITE_RELAY_MULTIADDR` (optional override for P2P relay)
- `apps/indexer/.env.local`:
  - `DATABASE_URL` and `PONDER_RPC_URL_*` are required for local or testnet indexing

---

## Standard Development (Single Chain)

For basic wallet registration flows on a single local chain.

#### Terminal 1: Start Anvil

```bash
pnpm anvil
```

#### Terminal 2: Deploy Contracts

```bash
pnpm deploy:dev
```

#### Terminal 3: Start Web App

```bash
pnpm dev
```

Open `http://localhost:5173` and connect MetaMask to `Localhost 8545`.

### MetaMask Setup (Standard)

| Field        | Value                 |
| ------------ | --------------------- |
| Network Name | Anvil Hub             |
| RPC URL      | http://127.0.0.1:8545 |
| Chain ID     | 31337                 |
| Symbol       | ETH                   |

Anvil Account 0 private key (10,000 ETH):

```text
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

---

## Cross-Chain Development (Hub + Spoke)

For testing the cross-chain flow where users register on a spoke chain and messages relay to the hub chain.

#### Terminal 1: Start Both Anvil Nodes + Hyperlane Relayer

```bash
pnpm anvil:crosschain
```

This starts:

- **Hub** (blue): localhost:8545, chain ID 31337 — loads Hyperlane state
- **Spoke** (green): localhost:8546, chain ID 31338 — loads Hyperlane state
- **Relayer** (yellow): Hyperlane message relayer between chains

#### Terminal 2: Deploy Cross-Chain Contracts

```bash
pnpm deploy:crosschain
```

#### Terminal 3: Start Web App (Cross-Chain Mode)

```bash
pnpm dev:crosschain
```

This sets `VITE_CROSSCHAIN=true` for the web app.

### MetaMask Setup (Cross-Chain)

Add the Spoke chain in MetaMask:

| Field        | Value                 |
| ------------ | --------------------- |
| Network Name | Anvil Spoke           |
| RPC URL      | http://127.0.0.1:8546 |
| Chain ID     | 31338                 |
| Symbol       | ETH                   |

The same Anvil private key works on both chains.

### Cross-Chain Testing Flow

1. Connect wallet to **Spoke Chain** (31338)
2. Register a stolen wallet via SpokeRegistry
3. Hyperlane relayer delivers the message to Hub
4. Switch to **Hub Chain** (31337) to verify registration

---

## Indexer Development (Ponder)

The indexer powers search and dashboard data.

```bash
pnpm indexer:codegen
pnpm indexer
```

Other helpers:

```bash
pnpm indexer:wipe
pnpm indexer:start
```

The indexer requires Postgres (`apps/indexer/.env.local`).

---

## Relay Server (P2P Registration)

The relay enables the helper-assisted P2P registration flow.

```bash
pnpm relay:setup   # generate keys.json
pnpm relay         # run relay
pnpm relay:debug   # verbose logging
```

---

## Landing + Docs

```bash
pnpm dev:landing
pnpm dev:docs
```

---

## Other Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm storybook
```

---

## Saving Dev State (Hyperlane)

For external infrastructure like Hyperlane that doesn't change, you can save Anvil state to avoid redeploying every time.

```bash
mkdir -p .anvil-state
anvil --port 8545 --chain-id 31337 --block-time 12 --dump-state .anvil-state/hub.json
anvil --port 8546 --chain-id 31338 --block-time 12 --dump-state .anvil-state/spoke.json
```

Deploy external contracts, then Ctrl+C both Anvil processes. Future runs can use `--load-state`.

---

## Project Structure

```text
stolen-wallet-registry-monorepo/
├── apps/
│   ├── web/       # Registry app
│   ├── landing/   # Marketing site
│   ├── docs/      # Docs site
│   ├── indexer/   # Indexer
│   └── relay/     # libp2p relay server
└── packages/      # Shared packages (contracts, cli, merkle, p2p, etc)
```

---

## Security

The registration flow uses EIP-712 typed data signing with a two-phase commit scheme:

1. **Acknowledgement** — User signs intent, starts grace period
2. **Grace Period** — Randomized delay (prevents automated phishing)
3. **Registration** — User signs final registration within time window

---

## Roadmap

| Phase | Focus                                  | Status      |
| ----- | -------------------------------------- | ----------- |
| 1     | Core registries (wallet, tx, contract) | ✅ Complete |
| 2     | Operator CLI + batch submissions       | ✅ Complete |
| 3     | Indexer, search, and dashboard         | ✅ Complete |
| 4     | Cross-chain infrastructure (Hyperlane) | ✅ Complete |
| 5     | Soulbound attestation tokens           | ✅ Complete |
| 6     | Testnet deployment (Base/OP Sepolia)   | In Progress |
| 7     | Transaction history API (Alchemy)      | In Progress |
| 8     | Mainnet deployment                     | Planned     |
| 9     | DAO governance + operator approval     | Future      |
| 10    | Additional chain support               | Future      |

See `PRPs/` for detailed planning documents.

---

## License

MIT

---

Built with the goal of making Web3 safer for everyone.
