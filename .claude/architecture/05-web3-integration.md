# 05: Web3 Integration Architecture

This document describes how wagmi 2.x, viem 2.x, and RainbowKit 2.x integrate to provide wallet connectivity and contract interactions.

---

## Overview

The Web3 stack consists of:

| Library            | Purpose                   | Version |
| ------------------ | ------------------------- | ------- |
| **wagmi**          | React hooks for Ethereum  | 2.x     |
| **viem**           | Low-level Ethereum client | 2.x     |
| **RainbowKit**     | Wallet connection UI      | 2.x     |
| **TanStack Query** | Async state management    | 5.x     |

---

## Provider Hierarchy

The provider order is critical:

```tsx
// File: apps/web/src/providers/AppProviders.tsx

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider defaultColorScheme="system" defaultVariant="base">
      <Web3Provider>{children}</Web3Provider>
    </ThemeProvider>
  );
}
```

**Why this order?**

- `ThemeProvider` must wrap `Web3Provider`
- RainbowKit needs theme context at render time
- Theme must be available before RainbowKit initializes

### Full Provider Stack

```
AppProviders
└─→ ThemeProvider
     └─→ Web3Provider
          └─→ WagmiProvider (wagmi config)
               └─→ QueryClientProvider (TanStack Query)
                    └─→ RainbowKitProvider (theme-aware)
                         └─→ App Content
```

---

## Wagmi Configuration

```typescript
// File: apps/web/src/lib/wagmi.ts

import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import type { Chain } from 'wagmi/chains';

// Custom localhost chain (Anvil/Hardhat)
export const localhost: Chain = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
};

// Supported chains
export const chains = [localhost, sepolia] as const;

// Config with optional WalletConnect
export const config = createConfig({
  chains,
  connectors: walletConnectProjectId
    ? [injected(), walletConnect({ projectId: walletConnectProjectId })]
    : [injected()],
  transports: {
    [localhost.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(getSepoliaRpcUrl()),
  },
});

// Type augmentation
declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
```

### RPC URL Configuration

```typescript
function getSepoliaRpcUrl(): string {
  // Environment override (production)
  const envUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
  if (envUrl) {
    return envUrl; // e.g., Alchemy/Infura endpoint
  }

  // Warn in production
  if (import.meta.env.PROD) {
    console.warn('[wagmi] Using public RPC - may be rate-limited');
  }

  return 'https://rpc.sepolia.org'; // Public fallback
}
```

---

## Web3Provider

```typescript
// File: apps/web/src/providers/Web3Provider.tsx

export function Web3Provider({ children }: Web3ProviderProps) {
  // Create QueryClient inside component to avoid SSR issues
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,    // 1 minute
            gcTime: 5 * 60 * 1000,   // 5 minutes (garbage collection)
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitWrapper>{children}</RainbowKitWrapper>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Inner component accesses ThemeProvider context
function RainbowKitWrapper({ children }: { children: ReactNode }) {
  const { resolvedColorScheme, themeVariant } = useTheme();

  // Memoize theme to avoid unnecessary re-renders
  const theme = useMemo(
    () => createRainbowKitTheme(resolvedColorScheme, themeVariant),
    [resolvedColorScheme, themeVariant]
  );

  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
}
```

---

## Contract Configuration

### Addresses

```typescript
// File: apps/web/src/lib/contracts/addresses.ts

export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [localhost.id]: '0x5fbdb2315678afecb367f032d93f642f64180aa3', // Anvil default
  [sepolia.id]: '0x0000000000000000000000000000000000000000', // TODO: Deploy
};

export function getContractAddress(chainId: number): `0x${string}` {
  // Environment override support
  if (chainId === localhost.id && import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST) {
    return import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST as `0x${string}`;
  }
  if (chainId === sepolia.id && import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA) {
    return import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA as `0x${string}`;
  }

  const address = CONTRACT_ADDRESSES[chainId];
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new Error(`No contract address for chain ${chainId}`);
  }
  return address;
}
```

### ABI

```typescript
// File: apps/web/src/lib/contracts/abis.ts

export const stolenWalletRegistryAbi = [
  // Write functions
  {
    type: 'function',
    name: 'acknowledgementOfRegistry',
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'owner', type: 'address' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'walletRegistration',
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'owner', type: 'address' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },

  // Read functions
  {
    type: 'function',
    name: 'generateHashStruct',
    inputs: [
      { name: 'forwarder', type: 'address' },
      { name: 'step', type: 'uint8' },
    ],
    outputs: [
      { name: '', type: 'uint256' }, // deadline
      { name: '', type: 'bytes32' }, // hash
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDeadlines',
    inputs: [{ name: 'session', type: 'address' }],
    outputs: [
      { name: '', type: 'uint256' }, // current block
      { name: '', type: 'uint256' }, // grace period start
      { name: '', type: 'uint256' }, // expiry
      { name: '', type: 'uint256' }, // (reserved)
      { name: '', type: 'uint256' }, // (reserved)
      { name: '', type: 'bool' }, // is registered
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonces',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'eip712Domain',
    inputs: [],
    outputs: [
      /* domain separator fields */
    ],
    stateMutability: 'view',
  },

  // Events
  {
    type: 'event',
    name: 'AcknowledgementEvent',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'isSponsored', type: 'bool', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RegistrationEvent',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'isSponsored', type: 'bool', indexed: true },
    ],
  },

  // Errors
  { type: 'error', name: 'Acknowlegement__Expired' },
  { type: 'error', name: 'Acknowlegement__InvalidSigner' },
  { type: 'error', name: 'InvalidNonce' },
  { type: 'error', name: 'Registration__ForwarderExpired' },
  { type: 'error', name: 'Registration__InvalidForwarder' },
  { type: 'error', name: 'Registration__InvalidSigner' },
  { type: 'error', name: 'Registration__SignatureExpired' },
  // ... ECDSA errors
] as const;
```

---

## Query Key Factory

TanStack Query keys for consistent cache management:

```typescript
// File: apps/web/src/lib/contracts/queryKeys.ts

export const registryKeys = {
  /** Root key for all registry queries */
  all: ['registry'] as const,

  /** Nonce queries */
  nonces: () => [...registryKeys.all, 'nonce'] as const,
  nonce: (address: `0x${string}`) => [...registryKeys.nonces(), address] as const,

  /** Deadline queries */
  deadlines: () => [...registryKeys.all, 'deadlines'] as const,
  deadline: (address: `0x${string}`) => [...registryKeys.deadlines(), address] as const,

  /** Hash struct queries */
  hashStructs: () => [...registryKeys.all, 'hashStruct'] as const,
  hashStruct: (forwarder: `0x${string}`, step: SignatureStep) =>
    [...registryKeys.hashStructs(), forwarder, step] as const,

  /** Registration status */
  registrations: () => [...registryKeys.all, 'registration'] as const,
  isRegistered: (address: `0x${string}`) =>
    [...registryKeys.registrations(), 'isRegistered', address] as const,
} as const;
```

### Stale Times

```typescript
export const registryStaleTime = {
  nonce: 30_000, // 30s - rarely changes
  deadlines: 5_000, // 5s - needs frequent updates during grace period
  hashStruct: 10_000, // 10s - includes deadline
  isRegistered: 60_000, // 60s - rarely changes
} as const;
```

---

## Contract Hooks Pattern

### Write Hook (Acknowledgement)

```typescript
// File: apps/web/src/hooks/useAcknowledgement.ts

import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';

export interface AcknowledgementParams {
  deadline: bigint;
  nonce: bigint;
  registeree: `0x${string}`;
  signature: ParsedSignature; // { v, r, s }
}

export interface UseAcknowledgementResult {
  submitAcknowledgement: (params: AcknowledgementParams) => Promise<`0x${string}`>;
  hash: `0x${string}` | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

export function useAcknowledgement(): UseAcknowledgementResult {
  const chainId = useChainId();

  // Get contract address for current chain
  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddress(chainId);
  } catch {
    contractAddress = undefined;
  }

  // Write contract hook
  const {
    writeContractAsync,
    data: hash,
    isPending,
    isError: isWriteError,
    error: writeError,
    reset,
  } = useWriteContract();

  // Wait for receipt
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Submit function
  const submitAcknowledgement = async (params: AcknowledgementParams) => {
    if (!contractAddress) {
      throw new Error('Contract not configured for this chain');
    }

    const { deadline, nonce, registeree, signature } = params;

    return writeContractAsync({
      address: contractAddress,
      abi: stolenWalletRegistryAbi,
      functionName: 'acknowledgementOfRegistry',
      args: [deadline, nonce, registeree, signature.v, signature.r, signature.s],
    });
  };

  return {
    submitAcknowledgement,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError: isWriteError || isReceiptError,
    error: writeError || receiptError,
    reset,
  };
}
```

### Read Hook (Deadlines)

```typescript
// File: apps/web/src/hooks/useContractDeadlines.ts

import { useReadContract, useBlockNumber, useChainId } from 'wagmi';

export interface DeadlinesData {
  currentBlock: bigint;
  start: bigint; // Grace period opens
  expiry: bigint; // Registration window closes
  isRegistered: boolean;
}

export function useContractDeadlines(address: `0x${string}` | undefined) {
  const chainId = useChainId();

  // Watch for new blocks to trigger refetch
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const contractAddress = address ? getContractAddress(chainId) : undefined;

  return useReadContract({
    address: contractAddress,
    abi: stolenWalletRegistryAbi,
    functionName: 'getDeadlines',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!contractAddress,
      staleTime: registryStaleTime.deadlines,
      // Transform raw tuple to typed object
      select: (data): DeadlinesData => ({
        currentBlock: data[0],
        start: data[1],
        expiry: data[2],
        isRegistered: data[5],
      }),
    },
  });
}
```

---

## Transaction Flow

### Write Transaction Lifecycle

```
User Action
    │
    ▼
┌─────────────────┐
│ useWriteContract │  ← writeContractAsync()
│                 │
│ isPending: true │  ← Wallet popup opens
└────────┬────────┘
         │
         ▼ (user signs)
┌─────────────────────────┐
│ Transaction submitted    │
│                         │
│ hash: 0x...             │  ← Transaction hash available
│ isPending: false        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ useWaitForTransaction   │
│                         │
│ isConfirming: true      │  ← Waiting for block confirmation
└────────┬────────────────┘
         │
         ▼ (block mined)
┌─────────────────────────┐
│ Transaction confirmed    │
│                         │
│ isConfirmed: true       │
│ isConfirming: false     │
└─────────────────────────┘
```

### Transaction States

| State     | `isPending` | `isConfirming` | `isConfirmed` | Description              |
| --------- | ----------- | -------------- | ------------- | ------------------------ |
| Idle      | false       | false          | false         | No transaction           |
| Signing   | true        | false          | false         | Wallet popup open        |
| Pending   | false       | true           | false         | Waiting for confirmation |
| Confirmed | false       | false          | true          | Transaction mined        |
| Error     | -           | -              | -             | `isError` = true         |

---

## RainbowKit Theming

Custom theme integration with app theme system:

```typescript
// File: apps/web/src/lib/rainbowkit-theme.ts

const PALETTES = {
  base: {
    light: {
      background: '#ffffff',
      foreground: '#000000',
      accentColor: '#888888',
      accentColorForeground: '#ffffff',
      // ...
    },
    dark: {
      background: '#000000',
      foreground: '#ffffff',
      accentColor: '#aaaaaa',
      accentColorForeground: '#000000',
      // ...
    },
  },
  hacker: {
    light: {
      /* green theme */
    },
    dark: {
      /* terminal green */
    },
  },
};

export function createRainbowKitTheme(colorScheme: 'light' | 'dark', variant: ThemeVariant): Theme {
  const baseTheme = colorScheme === 'dark' ? darkTheme() : lightTheme();
  const palette = PALETTES[variant][colorScheme];

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      accentColor: palette.accentColor,
      accentColorForeground: palette.accentColorForeground,
      modalBackground: palette.card,
      modalText: palette.foreground,
      // ... more color mappings
    },
    fonts: {
      body: variant === 'hacker' ? "'JetBrains Mono', monospace" : "'Space Grotesk', sans-serif",
    },
    radii: {
      actionButton: '8px',
      connectButton: '8px',
      modal: '12px',
    },
  };
}
```

---

## Block Number Watching

For grace period timing, watch block numbers:

```typescript
import { useBlockNumber } from 'wagmi';

// Watch for new blocks
const { data: blockNumber } = useBlockNumber({
  watch: true, // Subscribe to new blocks
});

// Use in countdown timer
const blocksRemaining = targetBlock - (blockNumber ?? 0n);
```

---

## Hook Organization

```
apps/web/src/hooks/
├── useAcknowledgement.ts       # Submit ACK transaction
├── useRegistration.ts          # Submit REG transaction
├── useContractNonce.ts         # Read nonce
├── useContractDeadlines.ts     # Read grace period deadlines
├── useGenerateHashStruct.ts    # Generate hash for signing
├── useSignEIP712.ts            # Sign EIP-712 messages
├── useCountdownTimer.ts        # Block-based countdown
└── useStepNavigation.ts        # Registration flow navigation
```

---

## Error Handling

### Contract Errors

The ABI includes typed errors:

```typescript
{ type: 'error', name: 'Acknowlegement__Expired' },
{ type: 'error', name: 'Registration__InvalidForwarder' },
```

Parse in hooks:

```typescript
import { BaseError, ContractFunctionRevertedError } from 'viem';

try {
  await submitAcknowledgement(params);
} catch (err) {
  if (err instanceof BaseError) {
    const revertError = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      // Handle specific errors
      if (errorName === 'Acknowlegement__Expired') {
        // Deadline passed
      }
    }
  }
}
```

### User-Friendly Messages

```typescript
// File: apps/web/src/lib/utils.ts

export function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Remove technical details, keep user-friendly message
    const message = err.message;

    if (message.includes('User rejected')) {
      return 'Transaction was rejected';
    }
    if (message.includes('insufficient funds')) {
      return 'Insufficient funds for gas';
    }
    // ... more mappings
  }
  return 'An unexpected error occurred';
}
```

---

## Environment Variables

| Variable                          | Purpose                  | Required   |
| --------------------------------- | ------------------------ | ---------- |
| `VITE_SEPOLIA_RPC_URL`            | Sepolia RPC endpoint     | Production |
| `VITE_WALLETCONNECT_PROJECT_ID`   | WalletConnect project    | Optional   |
| `VITE_CONTRACT_ADDRESS_LOCALHOST` | Override local address   | Optional   |
| `VITE_CONTRACT_ADDRESS_SEPOLIA`   | Override Sepolia address | Optional   |

---

## File Structure

```
apps/web/src/
├── lib/
│   ├── wagmi.ts                    # Chain config, connectors
│   ├── rainbowkit-theme.ts         # Custom theme
│   └── contracts/
│       ├── abis.ts                 # Contract ABI
│       ├── addresses.ts            # Address per chain
│       └── queryKeys.ts            # TanStack Query keys
│
├── providers/
│   ├── AppProviders.tsx            # Root provider composition
│   ├── ThemeProvider.tsx           # Theme context
│   └── Web3Provider.tsx            # Wagmi + RainbowKit
│
└── hooks/
    ├── useAcknowledgement.ts       # ACK write hook
    ├── useRegistration.ts          # REG write hook
    ├── useContractNonce.ts         # Read nonce
    ├── useContractDeadlines.ts     # Read deadlines
    └── useGenerateHashStruct.ts    # Generate hash
```

---

## Summary

The Web3 integration provides:

1. **Provider hierarchy** with correct ordering for theme access
2. **Wagmi 2.x configuration** with multiple chain support
3. **Contract ABI and addresses** with environment overrides
4. **Query key factory** for consistent cache management
5. **Custom hooks** for contract reads and writes
6. **Transaction state tracking** through full lifecycle
7. **RainbowKit theming** integrated with app theme system
8. **Block number watching** for grace period timing
9. **Error handling** with user-friendly messages
10. **Environment configuration** for production deployment

The architecture ensures:

- Clean separation between config, providers, and hooks
- Consistent state management via TanStack Query
- Type-safe contract interactions via viem
- Flexible theming through RainbowKit customization
