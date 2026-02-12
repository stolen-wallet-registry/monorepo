# Architecture Overview

High-level map of how the monorepo, contracts, and frontend systems connect.

---

## Monorepo Structure

```text
stolen-wallet-registry-monorepo/
├── apps/
│   ├── web/                    # Vite SPA - registry app
│   │   └── src/
│   │       ├── providers/      # ThemeProvider, Web3Provider
│   │       ├── stores/         # wallet + transaction stores, p2pStore
│   │       ├── hooks/          # Contract, P2P, signature, ENS hooks
│   │       ├── components/     # App-specific components
│   │       │   ├── composed/   # Business components (add stories)
│   │       │   ├── registration/ # StepRenderer + wallet step components
│   │       │   ├── tx-steps/   # Transaction step components
│   │       │   ├── dashboard/  # Dashboard + search
│   │       │   └── layout/     # Header, Layout
│   │       ├── pages/          # Route entry points
│   │       ├── lib/
│   │       │   ├── contracts/  # Addresses, queryKeys
│   │       │   ├── signatures/ # EIP-712 helpers + storage
│   │       │   ├── p2p/        # libp2p config
│   │       │   ├── errors/     # Error handler factories
│   │       │   ├── ens.ts      # ENS utilities
│   │       │   └── logger/     # Category-based logging
│   │       └── test/           # Test utilities
│   ├── landing/                # Next.js - marketing/info site
│   ├── docs/                   # Vocs static docs site
│   ├── indexer/                # Ponder blockchain indexer
│   └── relay/                  # libp2p relay server
├── packages/
│   ├── abis/                   # Generated TypeScript ABI exports
│   ├── caip/                   # CAIP-2/CAIP-10 utilities
│   ├── chains/                 # Chain config, addresses, RPC URLs
│   ├── cli/                    # Operator CLI tool
│   ├── contracts/              # Foundry smart contracts
│   ├── errors/                 # Contract error selectors + messages
│   ├── formatting/             # Address/value formatting utilities
│   ├── p2p/                    # P2P protocol constants + helpers
│   ├── search/                 # GraphQL query definitions
│   ├── signatures/             # EIP-712 type definitions + builders
│   └── ui/                     # @swr/ui shared component library
└── PRPs/                       # Planning documents
```

---

## Contract Architecture

### Hub Chain (Base)

Five core contracts deployed on the hub chain:

```text
FraudRegistryHub (router)
├── WalletRegistry          # Stolen wallet registration
├── TransactionRegistry     # Fraudulent transaction batches
├── ContractRegistry        # Malicious contract addresses
├── CrossChainInbox         # Receives cross-chain messages from spokes
└── (references)
    ├── OperatorRegistry    # DAO-approved operator management
    ├── OperatorSubmitter   # Operator batch submission entry point
    ├── FeeManager          # Chainlink-based fee calculation
    ├── WalletSoulbound     # Attestation NFT for registered wallets
    └── SupportSoulbound    # Donor recognition NFT
```

### Spoke Chains (OP Sepolia, etc.)

```text
SpokeRegistry
├── Wallet acknowledge/register (identical signatures to WalletRegistry)
├── Transaction acknowledge/register
├── HyperlaneAdapter        # Bridges registrations to hub
└── FeeManager              # Local fee calculation
```

### Storage Pattern

All registries use direct mapping storage with CAIP-derived keys:

```solidity
// Wallet: wildcard across all EVM chains
key = keccak256(abi.encodePacked("eip155:_:", wallet))

// Transaction: chain-specific
key = keccak256(abi.encode(txHash, chainId))

// Contract: chain-specific
key = keccak256(abi.encode(contractAddress, chainId))
```

No merkle trees. Direct O(1) reads via `isWalletRegistered()`, `isTransactionRegistered()`, etc.

---

## Provider Hierarchy (Critical Order)

```text
AppProviders
└─ ThemeProvider         ← MUST wrap Web3 (RainbowKit needs theme)
   └─ Web3Provider
      └─ WagmiProvider
         └─ QueryClientProvider
            └─ RainbowKitProvider
```

---

## Data Flow

```text
USER
  │
  ▼
PAGES (RegistrySelection, Wallet flows, Tx flows, Search, Dashboard, Soulbound)
  │
  ▼
STORES (formStore, registrationStore, transactionFormStore, transactionRegistrationStore, p2pStore)
  │
  ▼
HOOKS (useAcknowledgement, useRegistration, useTxAcknowledgement, useTxRegistration, useP2PConnection, useSignEIP712)
  │
  ├─────────────────┬─────────────────┐
  ▼                 ▼                 ▼
wagmi/viem      libp2p          sessionStorage
  │                 │                 │
  ▼                 ▼                 ▼
CONTRACTS       RELAY SERVER     SIGNATURES
  │
  ▼
INDEXER (Ponder) → DASHBOARD + SEARCH
```

---

## Core Patterns

| Pattern           | Description                                                       | See                      |
| ----------------- | ----------------------------------------------------------------- | ------------------------ |
| Step-based flow   | Wallet + transaction flows (standard, self-relay, P2P)            | 03-registration-flow.md  |
| Two-phase EIP-712 | ACK + REG signatures prevent phishing                             | 02-eip712-signatures.md  |
| Zustand stores    | immer + persist + devtools middleware                             | 04-state-management.md   |
| P2P relay         | Custom protocols for wallet + transaction signature relay         | 01-libp2p-relay.md       |
| Category logging  | wallet, contract, signature, p2p, etc.                            | 07-logger-system.md      |
| Contract storage  | Direct mappings with CAIP-derived keys, event-based batch linking | 09-storage-and-events.md |

---

## Key Invariants

**Security:**

- Two signatures required (ACK and REG) for wallet and transaction registration
- Grace period enforced (1-4 min randomized via `block.prevrandao`)
- Nonce prevents replay attacks (explicit parameter, fail-fast on mismatch)
- Deadline validation: signature deadline = timestamp, grace period = block number
- Shared EIP-712 domain `"StolenWalletRegistry"` version `"4"` across all contracts
- Cross-contract replay prevented by distinct typehashes, NOT domain separation

**Wallet Requirements:**

| Step | Standard   | Self-Relay  | P2P              |
| ---- | ---------- | ----------- | ---------------- |
| Sign | registeree | registeree  | registeree       |
| Pay  | registeree | **relayer** | relayer (remote) |

---

## Tech Stack

| Layer     | Tech                                |
| --------- | ----------------------------------- |
| Build     | Vite 7.x, TypeScript 5.9            |
| UI        | React 19, Tailwind 4.x, shadcn/ui   |
| Web3      | wagmi 2.x, viem 2.x, RainbowKit 2.x |
| State     | Zustand 5.x, TanStack Query 5.x     |
| P2P       | libp2p 3.x                          |
| Forms     | React Hook Form 7.x, Zod 4.x        |
| Contracts | Foundry, Solidity 0.8.24            |
| Indexer   | Ponder 0.16.x, PostgreSQL/PGlite    |
| CLI       | TypeScript, viem, commander         |

---

## Entry Points

**New registration step:**

1. Add to `RegistrationStep` type
2. Add to `STEP_SEQUENCES`
3. Create step component
4. Map in `StepRenderer.tsx`

**New contract hook:**

1. Add ABI function to `@swr/abis`
2. Add query key to `queryKeys.ts`
3. Create hook with wagmi

**New P2P protocol:**

1. Add to `PROTOCOLS` in `packages/p2p/src/protocols.ts`
2. Update Zod schema
3. Add handler in `useP2PSignatureRelay`

**New composed component:**

1. Create `ComponentName/` directory
2. Add `.tsx`, `.stories.tsx`, `index.ts`
