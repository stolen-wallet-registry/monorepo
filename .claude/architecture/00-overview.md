# Architecture Overview

High-level map of how frontend systems connect.

---

## Directory Structure

```text
apps/web/src/
├── providers/           # ThemeProvider, Web3Provider
├── stores/              # formStore, registrationStore, p2pStore
├── hooks/               # Contract, P2P, signature hooks
├── components/
│   ├── ui/              # shadcn primitives (don't modify)
│   ├── composed/        # Business components (add stories)
│   ├── registration/    # StepRenderer + step components
│   └── layout/          # Header, Layout
├── pages/               # Route entry points
├── lib/
│   ├── contracts/       # ABIs, addresses, queryKeys
│   ├── signatures/      # EIP-712 helpers
│   ├── p2p/             # libp2p config
│   └── logger/          # Category-based logging
└── test/                # Test utilities
```

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
PAGES (Home, StandardRegistration, SelfRelay, P2P*)
  │
  ▼
STORES (formStore, registrationStore, p2pStore)
  │
  ▼
HOOKS (useAcknowledgement, useP2PConnection, useSignEIP712)
  │
  ├─────────────────┬─────────────────┐
  ▼                 ▼                 ▼
wagmi/viem      libp2p          sessionStorage
  │                 │                 │
  ▼                 ▼                 ▼
BLOCKCHAIN      RELAY SERVER     SIGNATURES
```

---

## Core Patterns

| Pattern           | Description                                                     | See                     |
| ----------------- | --------------------------------------------------------------- | ----------------------- |
| Step-based flow   | 11 steps across 3 registration methods                          | 03-registration-flow.md |
| Two-phase EIP-712 | ACK + REG signatures prevent phishing                           | 02-eip712-signatures.md |
| Zustand stores    | immer + persist + devtools middleware                           | 04-state-management.md  |
| P2P relay         | 8 custom protocols for signature relay (see 01-libp2p-relay.md) | 01-libp2p-relay.md      |
| Category logging  | wallet, contract, signature, p2p, etc.                          | 07-logger-system.md     |

---

## Key Invariants

**Security:**

- Two signatures required (ACK and REG)
- Grace period enforced (1-4 min randomized)
- Nonce prevents replay attacks
- Deadline validation on contract

**Wallet Requirements:**

| Step | Standard   | Self-Relay  | P2P              |
| ---- | ---------- | ----------- | ---------------- |
| Sign | registeree | registeree  | registeree       |
| Pay  | registeree | **relayer** | relayer (remote) |

---

## Tech Stack

| Layer | Tech                                |
| ----- | ----------------------------------- |
| Build | Vite 7.x, TypeScript 5.9            |
| UI    | React 19, Tailwind 4.x, shadcn/ui   |
| Web3  | wagmi 2.x, viem 2.x, RainbowKit 2.x |
| State | Zustand 5.x, TanStack Query 5.x     |
| P2P   | libp2p 3.x                          |
| Forms | React Hook Form 7.x, Zod 4.x        |

---

## Entry Points

**New registration step:**

1. Add to `RegistrationStep` type
2. Add to `STEP_SEQUENCES`
3. Create step component
4. Map in `StepRenderer.tsx`

**New contract hook:**

1. Add ABI function
2. Add query key
3. Create hook with wagmi

**New P2P protocol:**

1. Add to `PROTOCOLS`
2. Update Zod schema
3. Add handler in `useP2PSignatureRelay`

**New composed component:**

1. Create `ComponentName/` directory
2. Add `.tsx`, `.stories.tsx`, `index.ts`
