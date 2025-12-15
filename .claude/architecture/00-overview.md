# Architecture Overview

This document provides a high-level map of how the Stolen Wallet Registry frontend systems connect and interact.

---

## Directory Structure

```
apps/web/src/
├── main.tsx                         # Entry point
├── App.tsx                          # Root component with routing
├── index.css                        # Global styles (Tailwind)
│
├── providers/                       # React context providers
│   ├── AppProviders.tsx            # Composite wrapper (CRITICAL ORDER)
│   ├── ThemeProvider.tsx           # Dark/light mode + variants
│   ├── ThemeProviderContext.ts     # Theme context definition
│   ├── Web3Provider.tsx            # wagmi + QueryClient + RainbowKit
│   └── useTheme.ts                 # Theme hook
│
├── stores/                          # Zustand state management
│   ├── formStore.ts                # Form values (registeree, relayer)
│   ├── registrationStore.ts        # Flow state (type, step, hashes)
│   └── p2pStore.ts                 # P2P connection state
│
├── hooks/                           # Custom React hooks
│   ├── useSignEIP712.ts            # EIP-712 signing
│   ├── useContractNonce.ts         # Read nonce from contract
│   ├── useContractDeadlines.ts     # Read grace period deadlines
│   ├── useGenerateHashStruct.ts    # Generate typed data hash
│   ├── useAcknowledgement.ts       # ACK transaction submission
│   ├── useRegistration.ts          # REG transaction submission
│   ├── useP2PConnection.ts         # libp2p node lifecycle
│   ├── useP2PSignatureRelay.ts     # P2P message passing
│   ├── useStepNavigation.ts        # Step progression
│   └── useCountdownTimer.ts        # Grace period countdown
│
├── components/
│   ├── ui/                          # shadcn/ui primitives
│   │   ├── button.tsx, card.tsx, input.tsx, etc.
│   │   └── [MagicUI components]
│   │
│   ├── composed/                    # Business logic components
│   │   ├── SignatureCard/          # Display signature data
│   │   ├── StepIndicator/          # Flow progress sidebar
│   │   ├── GracePeriodTimer/       # Countdown display
│   │   ├── WalletSwitchPrompt/     # Wallet switching guidance
│   │   ├── TransactionCard/        # Tx hash with explorer link
│   │   └── ErrorBoundary/          # Error handling
│   │
│   ├── registration/               # Registration flow
│   │   ├── StepRenderer.tsx        # Maps step → component
│   │   └── steps/                  # Step implementations
│   │       ├── InitialFormStep.tsx
│   │       ├── AcknowledgementPayStep.tsx
│   │       ├── GracePeriodStep.tsx
│   │       ├── RegistrationSignStep.tsx
│   │       ├── RegistrationPayStep.tsx
│   │       ├── P2P*Step.tsx        # P2P-specific steps
│   │       └── SuccessStep.tsx
│   │
│   ├── layout/                      # Page shell
│   │   ├── Layout.tsx
│   │   └── Header.tsx
│   │
│   ├── p2p/                         # P2P-specific UI
│   │   ├── PeerIdDisplay.tsx
│   │   └── PeerConnectForm.tsx
│   │
│   └── dev/                         # Development utilities
│       ├── DevTools.tsx
│       └── P2PDebugPanel.tsx
│
├── pages/                           # Page components
│   ├── HomePage.tsx                # Method selection
│   ├── StandardRegistrationPage.tsx
│   ├── SelfRelayRegistrationPage.tsx
│   ├── P2PRoleSelectionPage.tsx
│   ├── P2PRegistereeRegistrationPage.tsx
│   ├── P2PRelayerRegistrationPage.tsx
│   └── NotFoundPage.tsx
│
├── lib/                             # Utilities and configuration
│   ├── wagmi.ts                    # Web3 configuration
│   ├── rainbowkit-theme.ts         # RainbowKit theming
│   ├── utils.ts                    # General helpers
│   ├── blocks.ts                   # Block/time utilities
│   ├── explorer.ts                 # Block explorer links
│   │
│   ├── contracts/
│   │   ├── addresses.ts            # Contract addresses by chain
│   │   ├── abis.ts                 # Contract ABIs
│   │   └── queryKeys.ts            # React Query cache keys
│   │
│   ├── signatures/
│   │   ├── eip712.ts               # EIP-712 typed data builders
│   │   ├── storage.ts              # Signature localStorage
│   │   └── utils.ts                # Parsing, validation
│   │
│   ├── p2p/
│   │   ├── libp2p.ts               # Node creation, connections
│   │   ├── protocols.ts            # Protocol identifiers
│   │   └── types.ts                # Zod schemas, message types
│   │
│   ├── logger/
│   │   ├── index.ts                # Main export
│   │   ├── core.ts                 # Logger implementation
│   │   ├── types.ts                # LogLevel, LogCategory
│   │   ├── config.ts               # Environment defaults
│   │   └── formatters.ts           # Redaction, formatting
│   │
│   ├── schemas/                     # Zod validation schemas
│   │   ├── address.ts
│   │   ├── signature.ts
│   │   └── registration.ts
│   │
│   ├── errors/
│   │   └── index.ts                # Error types
│   │
│   └── types/
│       └── ethereum.ts             # Re-exports from viem
│
└── test/                            # Testing utilities
    ├── setup.ts
    └── test-utils.tsx
```

---

## Provider Hierarchy (CRITICAL ORDER)

The provider order is **security and functionality critical**. RainbowKit requires access to the theme context at render time.

```
AppProviders (entry point)
    │
    └─→ ThemeProvider
         │  - Manages dark/light mode
         │  - Manages theme variant (base/hacker)
         │  - MUST wrap Web3Provider
         │
         └─→ Web3Provider
              │
              └─→ WagmiProvider
                   │  - Web3 connection state
                   │  - Chain configuration
                   │
                   └─→ QueryClientProvider
                        │  - TanStack Query for caching
                        │  - Contract read caching
                        │
                        └─→ RainbowKitProvider
                             │  - Wallet connection UI
                             │  - Accesses ThemeProvider context
                             │
                             └─→ {children}
```

**File:** `apps/web/src/providers/AppProviders.tsx`

```typescript
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider defaultTheme="dark" defaultVariant="base">
      <Web3Provider>
        {children}
      </Web3Provider>
    </ThemeProvider>
  );
}
```

**Why this order matters:**

1. ThemeProvider must be outermost so RainbowKit can read theme
2. WagmiProvider must wrap QueryClientProvider (wagmi requirement)
3. RainbowKitProvider must be inside both wagmi and query providers

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
│                                │                                         │
│                                ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         PAGES                                     │   │
│  │  HomePage → StandardRegistrationPage → SelfRelayRegistrationPage │   │
│  │                    P2P*RegistrationPage                          │   │
│  └────────────────────────────┬─────────────────────────────────────┘   │
│                               │                                          │
│                               ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      STORES (Zustand)                             │   │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────┐           │   │
│  │  │ formStore   │  │registrationStore│  │  p2pStore   │           │   │
│  │  │ registeree  │  │ type            │  │ peerId      │           │   │
│  │  │ relayer     │  │ step            │  │ partnerPeerId│          │   │
│  │  │ NFT flags   │  │ ackHash         │  │ connected   │           │   │
│  │  │             │  │ regHash         │  │ status      │           │   │
│  │  └─────────────┘  └─────────────────┘  └─────────────┘           │   │
│  └────────────────────────────┬─────────────────────────────────────┘   │
│                               │                                          │
│                               ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         HOOKS                                     │   │
│  │  ┌───────────────────┐  ┌───────────────────┐                    │   │
│  │  │  Contract Hooks   │  │    P2P Hooks      │                    │   │
│  │  │  useAcknowledgement│  │  useP2PConnection │                    │   │
│  │  │  useRegistration  │  │  useP2PSignatureRelay│                  │   │
│  │  │  useContractNonce │  │                   │                    │   │
│  │  │  useContractDeadlines│                   │                    │   │
│  │  └─────────┬─────────┘  └────────┬──────────┘                    │   │
│  └────────────┼─────────────────────┼───────────────────────────────┘   │
│               │                     │                                    │
│               ▼                     ▼                                    │
│  ┌────────────────────┐    ┌────────────────────┐                       │
│  │   wagmi / viem     │    │      libp2p        │                       │
│  │  (Web3 Layer)      │    │   (P2P Layer)      │                       │
│  │                    │    │                    │                       │
│  │  - Read contract   │    │  - Circuit relay   │                       │
│  │  - Write contract  │    │  - WebRTC          │                       │
│  │  - Sign typed data │    │  - Stream data     │                       │
│  └─────────┬──────────┘    └────────┬───────────┘                       │
│            │                        │                                    │
│            ▼                        ▼                                    │
│  ┌────────────────────┐    ┌────────────────────┐                       │
│  │    BLOCKCHAIN      │    │    RELAY SERVER    │                       │
│  │  (localhost/sepolia)│    │  (libp2p circuit)  │                       │
│  └────────────────────┘    └────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer          | Technology            | Version | Purpose                      |
| -------------- | --------------------- | ------- | ---------------------------- |
| **Build**      | Vite                  | 7.x     | Fast dev server, HMR, ESM    |
| **Language**   | TypeScript            | 5.9     | Type safety                  |
| **Framework**  | React                 | 19      | UI components                |
| **Routing**    | wouter                | 3.x     | Lightweight client routing   |
| **Web3**       | wagmi                 | 2.x     | React hooks for Ethereum     |
| **Web3**       | viem                  | 2.x     | TypeScript Ethereum library  |
| **Web3**       | RainbowKit            | 2.x     | Wallet connection UI         |
| **State**      | Zustand               | 5.x     | Lightweight state management |
| **State**      | immer                 | 11.x    | Immutable state updates      |
| **Queries**    | TanStack Query        | 5.x     | Server state caching         |
| **P2P**        | libp2p                | 3.x     | Peer-to-peer networking      |
| **Forms**      | React Hook Form       | 7.x     | Form management              |
| **Validation** | Zod                   | 4.x     | Schema validation            |
| **Styling**    | Tailwind CSS          | 4.x     | Utility-first CSS            |
| **UI**         | shadcn/ui             | latest  | Radix-based components       |
| **Animation**  | motion                | 12.x    | framer-motion successor      |
| **Testing**    | Vitest                | 4.x     | Unit testing                 |
| **Testing**    | React Testing Library | 16.x    | Component testing            |
| **Dev**        | Storybook             | 10.x    | Component development        |

---

## Core Architectural Patterns

### 1. Step-Based Registration Flow

Registration follows a state machine pattern with 11 possible steps:

```typescript
type RegistrationStep =
  | 'acknowledge-and-sign' // Sign ACK message
  | 'acknowledge-and-pay' // Submit ACK tx (standard)
  | 'switch-and-pay-one' // Submit ACK tx (self-relay)
  | 'wait-for-connection' // P2P connection setup
  | 'acknowledgement-payment' // Wait for relayer ACK tx (P2P)
  | 'grace-period' // Randomized delay (all methods)
  | 'register-and-sign' // Sign REG message
  | 'register-and-pay' // Submit REG tx (standard)
  | 'switch-and-pay-two' // Submit REG tx (self-relay)
  | 'registration-payment' // Wait for relayer REG tx (P2P)
  | 'success'; // Completion
```

**StepRenderer** maps steps to components dynamically.

**See:** [03-registration-flow.md](./03-registration-flow.md)

### 2. EIP-712 Two-Phase Security

Registration requires **two separate signatures** to prevent phishing:

1. **Acknowledgement** - Intent to register + grace period setup
2. **Registration** - Final confirmation within time window

Both use EIP-712 typed data with identical message structure but different `primaryType`, generating distinct hashes.

**See:** [02-eip712-signatures.md](./02-eip712-signatures.md)

### 3. Zustand Store Pattern

Three stores with granular selectors:

```typescript
// Fine-grained subscriptions prevent unnecessary re-renders
const registeree = useRegisteree(); // formStore
const step = useRegistrationStep(); // registrationStore
const isConnected = useIsConnectedToPeer(); // p2pStore
```

Middleware stack: `immer` + `persist` + `devtools`

**See:** [04-state-management.md](./04-state-management.md)

### 4. P2P Signature Relay

For users without funds, signatures flow via libp2p:

```
Registeree (no funds)  ←──P2P──→  Relayer (has funds)
     │                                  │
     │  signs with stolen wallet        │  submits tx, pays gas
     │  sends signature via P2P         │  sends tx hash via P2P
     └──────────────────────────────────┘
```

8 custom protocols handle the handshake and message passing.

**See:** [01-libp2p-relay.md](./01-libp2p-relay.md)

### 5. Component Hierarchy

```
ui/           → shadcn primitives (don't modify)
composed/     → Business components (add stories)
registration/ → Flow-specific components
pages/        → Route entry points
```

**See:** [06-component-patterns.md](./06-component-patterns.md)

### 6. Category-Based Logging

```typescript
logger.wallet.info('Connected', { address, chainId });
logger.contract.debug('Reading deadlines', { registeree });
logger.signature.warn('Expired', { deadline });
logger.registration.error('Failed', { step }, error);
logger.p2p.info('Peer connected', { peerId });
```

Environment-aware configuration: dev/staging/prod/test.

**See:** [07-logger-system.md](./07-logger-system.md)

---

## Key Invariants

### Security-Critical

1. **Two signatures required** - ACK and REG are separate
2. **Grace period enforced** - 1-4 minute randomized delay
3. **Nonce prevents replay** - Increments after each ACK
4. **Deadline validation** - Contract rejects expired signatures
5. **Wallet verification** - ACK/REG must be signed by registeree

### Wallet Requirements per Step

| Step     | Standard   | Self-Relay  | P2P              |
| -------- | ---------- | ----------- | ---------------- |
| ACK Sign | registeree | registeree  | registeree       |
| ACK Pay  | registeree | **relayer** | relayer (remote) |
| REG Sign | registeree | registeree  | registeree       |
| REG Pay  | registeree | **relayer** | relayer (remote) |

### Data Persistence

| Store             | Persists                       | Resets on Reload                |
| ----------------- | ------------------------------ | ------------------------------- |
| formStore         | registeree, relayer, NFT flags | -                               |
| registrationStore | type, step, hashes             | -                               |
| p2pStore          | peerId, partnerPeerId          | connectionStatus, isInitialized |
| Signatures        | In localStorage with TTL       | After 30 min or on success      |

---

## Cross-References

| Topic               | Document                                               |
| ------------------- | ------------------------------------------------------ |
| P2P signature relay | [01-libp2p-relay.md](./01-libp2p-relay.md)             |
| EIP-712 signatures  | [02-eip712-signatures.md](./02-eip712-signatures.md)   |
| Registration flow   | [03-registration-flow.md](./03-registration-flow.md)   |
| State management    | [04-state-management.md](./04-state-management.md)     |
| Web3 integration    | [05-web3-integration.md](./05-web3-integration.md)     |
| Component patterns  | [06-component-patterns.md](./06-component-patterns.md) |
| Logger system       | [07-logger-system.md](./07-logger-system.md)           |
| Error handling      | [08-error-handling.md](./08-error-handling.md)         |

---

## Entry Points for Common Tasks

### Adding a New Registration Step

1. Add step to `RegistrationStep` type in `registrationStore.ts`
2. Add step to appropriate sequence array in `registrationStore.ts`
3. Create step component in `components/registration/steps/`
4. Add mapping in `StepRenderer.tsx`

### Adding a New Contract Hook

1. Add ABI to `lib/contracts/abis.ts`
2. Add query key to `lib/contracts/queryKeys.ts`
3. Create hook in `hooks/` using wagmi's `useReadContract` or `useWriteContract`
4. Add logging with appropriate category

### Adding a New P2P Protocol

1. Add protocol constant in `lib/p2p/protocols.ts`
2. Update Zod schema in `lib/p2p/types.ts` if new message fields
3. Add handler in `useP2PSignatureRelay.ts` for role (registeree/relayer)
4. Add send method if needed

### Adding a New Composed Component

1. Create directory in `components/composed/ComponentName/`
2. Create `ComponentName.tsx`, `index.ts`
3. Add `ComponentName.stories.tsx` for Storybook
4. Add `ComponentName.test.tsx` for unit tests (if complex logic)
