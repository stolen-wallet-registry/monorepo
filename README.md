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

```text
Build:     Vite 7.x, TypeScript 5.9, Turborepo 2.x, pnpm
UI:        React 19, Tailwind CSS 4.x, shadcn/ui, Radix UI
Web3:      wagmi 2.x, viem 2.x, RainbowKit 2.x, TanStack Query 5.x
State:     Zustand 5.x, React Hook Form 7.x, Zod 4.x
Testing:   Vitest 4.x, Storybook 10.x, Testing Library
Contracts: Foundry, Solidity 0.8.21, OpenZeppelin
```

## Development

Full local development requires smart contracts (Anvil), the frontend, and optionally the relay server for P2P testing. There are two development modes:

1. **Standard Development** — Single Anvil chain for basic registration testing
2. **Cross-Chain Development** — Two Anvil chains (Hub + Spoke) for cross-chain flow testing

### Prerequisites

- Node.js 22+
- pnpm 9+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contracts)

```bash
# Install dependencies
pnpm install
```

---

### Standard Development (Single Chain)

For testing basic wallet registration flows on a single chain.

**Terminal 1: Start Anvil**

```bash
pnpm anvil
```

This runs: `anvil --ipc /tmp/anvil.ipc --steps-tracing --block-time 13`

**Terminal 2: Deploy Contracts**

```bash
pnpm deploy:dev
```

Deploys RegistryHub and StolenWalletRegistry to localhost:8545 (chain ID 31337).

**Terminal 3: Start Frontend**

```bash
pnpm dev
```

Open http://localhost:5173 and connect MetaMask to "Localhost 8545".

#### MetaMask Setup (Standard)

MetaMask typically auto-detects localhost:8545, but if needed:

| Field        | Value                 |
| ------------ | --------------------- |
| Network Name | Anvil Hub             |
| RPC URL      | http://127.0.0.1:8545 |
| Chain ID     | 31337                 |
| Symbol       | ETH                   |

Import the default Anvil account for testing:

- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- This gives you 10,000 ETH for testing

---

### Cross-Chain Development (Hub + Spoke)

For testing the full cross-chain registration flow where users register on a spoke chain and messages relay to the hub chain.

**Terminal 1: Start Both Anvil Nodes**

```bash
pnpm anvil:crosschain
```

This starts two Anvil instances:

- **Hub** (blue): localhost:8545, chain ID 31337
- **Spoke** (green): localhost:8546, chain ID 31338

**Terminal 2: Deploy Cross-Chain Contracts**

```bash
pnpm deploy:crosschain
```

Deploys to both chains:

| Chain         | Contract                   | Address                                    |
| ------------- | -------------------------- | ------------------------------------------ |
| Hub (31337)   | MockMailbox                | 0x5FbDB2315678afecb367f032d93F642f64180aa3 |
| Hub (31337)   | RegistryHub                | 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 |
| Hub (31337)   | StolenWalletRegistry       | 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 |
| Hub (31337)   | CrossChainInbox            | 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 |
| Spoke (31338) | MockMailbox                | 0x5FbDB2315678afecb367f032d93F642f64180aa3 |
| Spoke (31338) | MockInterchainGasPaymaster | 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 |
| Spoke (31338) | HyperlaneAdapter           | 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 |
| Spoke (31338) | SpokeRegistry              | 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 |

**Terminal 3: Start Frontend (Cross-Chain Mode)**

```bash
pnpm dev:crosschain
```

This sets `VITE_CROSSCHAIN=true`, enabling the spoke chain in the wallet connection UI. A chain indicator badge appears showing whether you're on Hub or Spoke.

#### MetaMask Setup (Cross-Chain)

You need both networks configured. The Hub chain is the same as standard development. Add the Spoke chain:

**Add Spoke Network to MetaMask:**

1. Open MetaMask → Networks → Add Network → Add a network manually
2. Enter these values:

| Field        | Value                 |
| ------------ | --------------------- |
| Network Name | Anvil Spoke           |
| RPC URL      | http://127.0.0.1:8546 |
| Chain ID     | 31338                 |
| Symbol       | ETH                   |

3. Click Save

The same Anvil private key works on both chains (both have 10,000 ETH):

- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

#### Cross-Chain Testing Flow

1. Connect wallet to **Spoke Chain** (31338)
2. Register a stolen wallet via SpokeRegistry
3. The Hyperlane relayer delivers the message to Hub
4. Switch to **Hub Chain** (31337) to verify registration

---

### Other Commands

```bash
pnpm storybook    # Component development (port 6006)
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm format       # Prettier
```

### Relay Server (for P2P Registration)

The relay server enables P2P registration where a helper can pay gas on behalf of a user with a drained wallet. Only needed when testing P2P relay functionality.

**Location:** `apps/relay/`

```bash
pnpm relay              # Run relay server
pnpm relay:debug        # Run with debug logging
```

## Project Structure

```text
stolen-wallet-registry-monorepo/
├── apps/
│   ├── relay/                # libp2p circuit relay server
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
| 4     | Cross-L2 EVM integration                          | Future      |
| 5     | Cross-blockchain support (CAIP-10)                | Future      |
| 6     | DAO governance & operator system                  | Future      |

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
