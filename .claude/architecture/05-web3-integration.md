# Web3 Integration

wagmi 2.x, viem 2.x, and RainbowKit 2.x configuration.

---

## Provider Hierarchy

```text
AppProviders
└─ ThemeProvider        ← Must wrap Web3 (RainbowKit needs theme)
   └─ Web3Provider
      └─ WagmiProvider
         └─ QueryClientProvider
            └─ RainbowKitProvider
```

---

## Wagmi Config

```typescript
// apps/web/src/lib/wagmi.ts

import {
  anvilHub,
  anvilSpoke,
  baseSepolia,
  optimismSepolia,
  toWagmiChain,
  getRpcUrl,
} from '@swr/chains';

export const isCrossChainMode = import.meta.env.VITE_CROSSCHAIN === 'true';
export const isTestnetMode = import.meta.env.VITE_TESTNET === 'true';

const chains = isTestnetMode
  ? [toWagmiChain(baseSepolia), toWagmiChain(optimismSepolia)]
  : isCrossChainMode
    ? [toWagmiChain(anvilHub), toWagmiChain(anvilSpoke)]
    : [toWagmiChain(anvilHub)];

export const config = createConfig({
  chains,
  connectors: [injected(), walletConnect({ projectId })],
  transports: Object.fromEntries(chains.map((c) => [c.id, http(getRpcUrl(c.id))])),
});
```

---

## Contract Config

```typescript
// apps/web/src/lib/contracts/addresses.ts

export function getContractAddress(contract: ContractName, chainId: number): Address {
  // 1) contract-specific env override (VITE_<CONTRACT>_ADDRESS_<CHAINID>)
  // 2) @swr/chains (hub contracts when available)
  // 3) local deterministic defaults
}
```

---

## Query Keys

```typescript
// apps/web/src/lib/contracts/queryKeys.ts

export const registryKeys = {
  all: ['registry'] as const,
  nonce: (address) => [...registryKeys.all, 'nonce', address],
  deadline: (address) => [...registryKeys.all, 'deadlines', address],
  hashStruct: (forwarder, step) => [...registryKeys.all, 'hashStruct', forwarder, step],
};

export const registryStaleTime = {
  nonce: 30_000, // 30s
  deadlines: 5_000, // 5s (frequent during grace period)
  hashStruct: 10_000, // 10s
};
```

---

## Contract Hooks

### Wallet Acknowledgement

```typescript
// apps/web/src/hooks/useAcknowledgement.ts

export function useAcknowledgement() {
  const { writeContractAsync, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const submitAcknowledgement = async (params) => {
    return writeContractAsync({
      address: contractAddress,
      abi: walletRegistryAbi, // from @swr/abis
      functionName: 'acknowledge',
      args: [
        registeree, // address
        trustedForwarder, // address
        reportedChainId, // uint64
        incidentTimestamp, // uint64
        deadline, // uint256 (signature expiry, timestamp)
        nonce, // uint256
        v,
        r,
        s, // signature components
      ],
    });
  };

  return { submitAcknowledgement, hash, isPending, isConfirming, isConfirmed, reset };
}
```

### Wallet Registration

```typescript
// apps/web/src/hooks/useRegistration.ts

// Same signature as acknowledge — hub and spoke are unified
writeContractAsync({
  functionName: 'register',
  args: [
    registeree,
    trustedForwarder,
    reportedChainId,
    incidentTimestamp,
    deadline,
    nonce,
    v,
    r,
    s,
  ],
});
```

### Read Hook Pattern

```typescript
// apps/web/src/hooks/useContractDeadlines.ts

export function useContractDeadlines(address) {
  const { data: blockNumber } = useBlockNumber({ watch: true });

  return useReadContract({
    functionName: 'getDeadlines',
    args: [address],
    query: {
      enabled: !!address,
      staleTime: registryStaleTime.deadlines,
      select: (data) => ({ currentBlock: data[0], start: data[1], expiry: data[2] }),
    },
  });
}
```

---

## Transaction States

| State     | isPending | isConfirming | isConfirmed |
| --------- | --------- | ------------ | ----------- |
| Idle      | false     | false        | false       |
| Signing   | true      | false        | false       |
| Pending   | false     | true         | false       |
| Confirmed | false     | false        | true        |

---

## RainbowKit Theme

```typescript
// apps/web/src/lib/rainbowkit-theme.ts

export function createRainbowKitTheme(colorScheme, variant): Theme {
  const baseTheme = colorScheme === 'dark' ? darkTheme() : lightTheme();
  const palette = PALETTES[variant][colorScheme];

  return {
    ...baseTheme,
    colors: { ...baseTheme.colors, accentColor: palette.accentColor /* ... */ },
    fonts: { body: variant === 'hacker' ? 'JetBrains Mono' : 'Space Grotesk' },
  };
}
```

---

## Environment Variables

| Variable                        | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `VITE_ALCHEMY_API_KEY`          | Transaction history + ENS resolution     |
| `VITE_MAINNET_RPC_URL`          | Explicit mainnet RPC for ENS resolution  |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect                            |
| `VITE_RELAY_MULTIADDR`          | P2P relay override                       |
| `VITE_TESTNET`                  | Use testnets instead of localhost        |
| `VITE_CROSSCHAIN`               | Enable cross-chain mode                  |
| `VITE_APP_ENV`                  | Logging environment (staging/production) |
| `VITE_*_ADDRESS_<CHAINID>`      | Contract address overrides               |

---

## ENS Integration

The app resolves ENS names for human-readable address display. ENS resolution requires **mainnet** even when the app operates on testnets.

### Mainnet Transport

```typescript
// apps/web/src/lib/wagmi.ts

// Mainnet is included in chains array ONLY for ENS resolution
// App transactions still go to testnets (Base Sepolia, OP Sepolia)
const chains = [...appChains, mainnet];

const transports = {
  ...appTransports,
  [mainnet.id]: http(getMainnetRpcUrl()), // For ENS only
};
```

### ENS Hooks

```typescript
// Address → ENS name
import { useEnsDisplay } from '@/hooks/ens';

const { name, avatar, isLoading } = useEnsDisplay(address);

// ENS name → address
import { useEnsResolve } from '@/hooks/ens';

const { address, isLoading, isError } = useEnsResolve('vitalik.eth');
```

### ENS-Aware Components

```typescript
import { EnsExplorerLink } from '@/components/composed/EnsExplorerLink';

<EnsExplorerLink value={address} />
// Displays: "vitalik.eth" (with 0x... in tooltip)
```

### Caching

| Setting     | Value  | Rationale                     |
| ----------- | ------ | ----------------------------- |
| `staleTime` | 5 min  | ENS names rarely change       |
| `gcTime`    | 30 min | Keep in cache for navigation  |
| `retry`     | 1      | Single retry on network error |

---

## Transaction History (Alchemy TODO)

`useUserTransactions` currently scans local Anvil blocks via viem. For non-local networks, it logs a warning and returns an error because Alchemy is not implemented yet.

---

## Key Files

```text
apps/web/src/
├── lib/
│   ├── wagmi.ts                 # Chain config (includes mainnet for ENS)
│   ├── ens.ts                   # ENS utilities (isEnsName, detectSearchTypeWithEns)
│   ├── rainbowkit-theme.ts      # Theme integration
│   └── contracts/
│       ├── addresses.ts         # Contract address resolution
│       └── queryKeys.ts         # TanStack Query keys + stale times
├── components/composed/
│   └── EnsExplorerLink/         # ENS-aware address display
├── providers/
│   └── Web3Provider.tsx
└── hooks/
    ├── ens/
    │   ├── useEnsDisplay.ts     # Address → name + avatar
    │   └── useEnsResolve.ts     # Name → address
    ├── useAcknowledgement.ts    # acknowledge() write hook
    ├── useRegistration.ts       # register() write hook
    ├── useContractNonce.ts      # nonces() read hook
    ├── useContractDeadlines.ts  # getDeadlines() read hook
    └── useUserTransactions.ts   # Local scan; non-local returns TODO error
```
