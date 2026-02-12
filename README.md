# Stolen Wallet Registry

A decentralized, cross-chain fraud registry that lets victims report stolen wallets and transactions on-chain, giving exchanges and security teams a public source of truth for fraud data.

## Architecture

```mermaid
graph TD
    User([User / Victim]) --> Frontend[Frontend<br/>Vite + React]
    Operator([Operator / Exchange]) --> CLI[CLI<br/>Batch Submissions]
    Helper([P2P Helper]) --> Relay[Relay Server<br/>libp2p]

    Frontend --> Hub[Hub Contracts<br/>Base]
    Frontend --> Spoke[Spoke Contracts<br/>L2s]
    CLI --> Hub
    Relay --> Frontend

    Spoke -->|Hyperlane| Hub
    Hub --> Indexer[Indexer<br/>Ponder + Postgres]
    Indexer --> Dashboard[Dashboard + Search]
```

## Registries

| Registry        | What's Registered             | Who Can Submit          |
| --------------- | ----------------------------- | ----------------------- |
| **Wallet**      | Stolen wallet addresses       | Individuals + operators |
| **Transaction** | Fraudulent transaction hashes | Individuals + operators |
| **Contract**    | Malicious contract addresses  | Operators only          |

## Packages

```text
apps/web           Registry frontend (Vite + React 19)
apps/docs          Documentation site (Vocs)
apps/landing       Marketing site
apps/indexer       Event indexer (Ponder)
apps/relay         P2P relay server (libp2p)
packages/contracts Smart contracts (Foundry)
packages/abis      Generated contract ABIs
packages/chains    Chain configs + CAIP utilities
packages/search    Search/query library
packages/p2p       Shared P2P types + protocols
packages/cli       Operator CLI tool
packages/errors    Contract error selectors + messages
packages/caip      CAIP identifier utilities
```

## Quick Start

Three terminals to get the full hub-spoke architecture running locally with Hyperlane message passing:

```bash
pnpm install && pnpm forge:build   # Install + build contracts
pnpm anvil:crosschain              # Terminal 1 — Two Anvil chains + Hyperlane relayer
pnpm deploy:crosschain             # Terminal 2 — Deploy hub + spoke contracts
pnpm dev:crosschain                # Terminal 3 — Frontend with cross-chain features
```

Open `http://localhost:5173`. See the [setup guide](https://monorepo-docs-sepia.vercel.app/dev/setup) for MetaMask setup, test accounts, and indexer instructions.

> **Note:** The indexer (`apps/indexer`) is required for the dashboard and search functionality. The relay server (`apps/relay`) is only needed for P2P gasless registration.

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

## Documentation

Full docs at [monorepo-docs-sepia.vercel.app](https://monorepo-docs-sepia.vercel.app). Source lives in `apps/docs/` (Vocs) — run locally with `pnpm --filter docs dev`.

Key sections:

- [Setup Guide](https://monorepo-docs-sepia.vercel.app/dev/setup) -- Local development
- [Hub-Spoke Architecture](https://monorepo-docs-sepia.vercel.app/concepts/hub-spoke) -- Cross-chain design
- [Operator Protocol](https://monorepo-docs-sepia.vercel.app/operator) -- Batch submissions
- [P2P Relay](https://monorepo-docs-sepia.vercel.app/p2p) -- Gasless registration

## What's Built

- Core registries (wallet, transaction, contract)
- Operator CLI + batch submissions
- Event indexer, search, and dashboard
- Cross-chain infrastructure (Hyperlane hub-spoke)
- Soulbound attestation tokens
- P2P gasless relay (libp2p)

## Future Development

- Testnet deployment (Base Sepolia / OP Sepolia)
- DAO governance + operator approval
- Operator-as-Paymaster (EIP-4337)
- TypeScript SDK + Solidity on-chain query library
- Etherscan direct registration guide
- Additional chain support

## License

MIT

---

Built with the goal of making Web3 safer for everyone.
