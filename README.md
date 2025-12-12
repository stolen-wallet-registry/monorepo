# Stolen Wallet Registry

A decentralized fraud detection and transparency registry system for Web3. Enables victims of crypto fraud to register stolen wallets on-chain, providing exchanges, off-ramps, and other services access to verified fraud data.

## Overview

The Stolen Wallet Registry (SWR) gives crypto fraud victims a way to publicly mark their wallets as compromised—even when they've lost access to funds. By creating a transparent, on-chain registry, we enable the broader ecosystem to detect and prevent fraud.

### Key Features

- **Self-attestation with proof of ownership** — Users sign with their wallet to prove they own it before registering it as stolen
- **Anti-phishing protection** — Two-phase EIP-712 signing with randomized grace period prevents single-transaction attacks
- **No funds required** — Relay mechanisms allow registration even with completely drained wallets
- **Cross-chain vision** — CAIP-10 compliant design for multi-chain support (Ethereum L2s, Solana, Bitcoin)

### Registration Methods

1. **Standard** — Sign and pay with the wallet being registered
2. **Self-Relay** — Sign with compromised wallet, pay gas from a different wallet
3. **P2P Relay** — Sign with compromised wallet, a trusted helper pays gas via libp2p relay

## Tech Stack

```
Build:     Vite 7.x, TypeScript 5.9, Turborepo 2.x, pnpm
UI:        React 19, Tailwind CSS 4.x, shadcn/ui, Radix UI
Web3:      wagmi 2.x, viem 2.x, RainbowKit 2.x, TanStack Query 5.x
State:     Zustand 5.x, React Hook Form 7.x, Zod 4.x
Testing:   Vitest 4.x, Storybook 10.x, Testing Library
Contracts: Foundry, Solidity 0.8.21, OpenZeppelin
```

## Development

Full local development requires three components running: smart contracts (Anvil), the frontend, and optionally the relay server for P2P testing.

### Prerequisites

- Node.js 20+
- pnpm 9+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contracts)

### 1. Smart Contracts

The contracts currently live in a separate repository and will be integrated into this monorepo in a future phase.

**Repository:** [stolen-wallet-registry-contracts](https://github.com/stolen-wallet-registry/stolen-wallet-registry-contracts)

```bash
# Clone the contracts repo
git clone https://github.com/stolen-wallet-registry/stolen-wallet-registry-contracts.git
cd stolen-wallet-registry-contracts

# Install dependencies and build
pnpm install
forge build

# Start local Anvil node (in a separate terminal)
# --block-time 13 is required for the grace period timer to work
anvil --ipc /tmp/anvil.ipc --steps-tracing --block-time 13

# Deploy contracts to local Anvil
pnpm deploy:dev
```

The `--block-time 13` flag simulates ~13 second block times (similar to Ethereum mainnet), which is required for the grace period countdown feature to function correctly.

### 2. Frontend

```bash
# From the monorepo root
pnpm install
pnpm dev          # Start Vite dev server (port 5173)
```

Other useful commands:

```bash
pnpm storybook    # Component development (port 6006)
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
```

### 3. Relay Server (for P2P Registration)

The relay server enables P2P registration where a helper can pay gas on behalf of a user with a drained wallet. Only needed when testing P2P relay functionality.

**Location:** `../relayer/` (relative to monorepo)

```bash
cd ../relayer
pnpm install

# Run relay server
pnpm p2p-circuit

# Run with debug logging (verbose libp2p output)
pnpm p2p-circuit:debug
```

## Project Structure

```
stolen-wallet-registry-monorepo/
├── apps/
│   └── web/                  # Vite frontend application
│       ├── src/
│       │   ├── components/   # UI and composed components
│       │   ├── hooks/        # Custom React hooks
│       │   ├── lib/          # Utilities, contracts, signatures
│       │   ├── providers/    # React context providers
│       │   └── stores/       # Zustand state stores
│       └── .storybook/       # Storybook configuration
└── packages/                 # Shared packages (future)
```

## Roadmap

The project follows a phased development approach:

| Phase | Focus                                             | Status      |
| ----- | ------------------------------------------------- | ----------- |
| 1     | Frontend rebuild with Vite + modern stack         | In Progress |
| 2     | Monorepo consolidation (merge contracts, relay)   | Planned     |
| 3     | Contract architecture expansion (3 subregistries) | Planned     |
| 4     | Cross-L2 integration                              | Future      |
| 5     | DAO governance & operator system                  | Future      |

### Future Subregistries

1. **Stolen Wallet Registry** — User self-attestation (current focus)
2. **Fraudulent Contract Registry** — Operator-submitted malicious contracts
3. **Stolen Transaction Registry** — Mark specific fraudulent transactions

## Security

The registration flow uses EIP-712 typed data signing with a two-phase commit scheme:

1. **Acknowledgement** — User signs intent, starts grace period
2. **Grace Period** — Randomized 1-4 minute delay (prevents automated phishing)
3. **Registration** — User signs final registration within time window

This design prevents attackers from tricking users into signing a single transaction that immediately registers their wallet.

## License

MIT

---

Built with the goal of making Web3 safer for everyone.
