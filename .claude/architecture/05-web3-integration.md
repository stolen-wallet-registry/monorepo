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

**Write hook pattern:**

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
      abi: stolenWalletRegistryAbi,
      functionName: 'acknowledgementOfRegistry',
      args: [deadline, nonce, registeree, v, r, s],
    });
  };

  return { submitAcknowledgement, hash, isPending, isConfirming, isConfirmed, reset };
}
```

**Read hook pattern:**

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
// name: "vitalik.eth" or null
// avatar: URL or null (if includeAvatar: true)

// ENS name → address
import { useEnsResolve } from '@/hooks/ens';

const { address, isLoading, isError } = useEnsResolve('vitalik.eth');
// address: "0xd8dA6BF269..." or null
```

### ENS-Aware Components

```typescript
// Instead of ExplorerLink, use EnsExplorerLink for address display
import { EnsExplorerLink } from '@/components/composed/EnsExplorerLink';

<EnsExplorerLink value={address} />
// Displays: "vitalik.eth" (with 0x... in tooltip)
// Falls back to truncated address if no ENS name
```

### Caching

ENS queries use TanStack Query with aggressive caching:

| Setting     | Value  | Rationale                     |
| ----------- | ------ | ----------------------------- |
| `staleTime` | 5 min  | ENS names rarely change       |
| `gcTime`    | 30 min | Keep in cache for navigation  |
| `retry`     | 1      | Single retry on network error |

### Environment Variables

```bash
# Either of these enables ENS resolution:
VITE_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/key
# OR
VITE_ALCHEMY_API_KEY=key  # Constructs mainnet URL automatically
```

---

## Transaction History (Alchemy TODO)

`useUserTransactions` currently scans local Anvil blocks via viem. For non-local networks, it logs a warning and returns an error because Alchemy is not implemented yet.

Planned implementation (when added):

- Use `VITE_ALCHEMY_API_KEY`
- Fetch transaction history via Alchemy enhanced APIs
- Map chain IDs to Alchemy networks

---

## Key Files

```text
apps/web/src/
├── lib/
│   ├── wagmi.ts                 # Chain config (includes mainnet for ENS)
│   ├── ens.ts                   # ENS utilities (isEnsName, detectSearchTypeWithEns)
│   ├── rainbowkit-theme.ts      # Theme integration
│   └── contracts/
│       ├── abis.ts
│       ├── addresses.ts
│       └── queryKeys.ts
├── components/composed/
│   └── EnsExplorerLink/         # ENS-aware address display
├── providers/
│   └── Web3Provider.tsx
└── hooks/
    ├── ens/
    │   ├── useEnsDisplay.ts     # Address → name + avatar
    │   └── useEnsResolve.ts     # Name → address
    ├── useAcknowledgement.ts
    ├── useRegistration.ts
    ├── useContractNonce.ts
    ├── useContractDeadlines.ts
    └── useUserTransactions.ts   # Local scan; non-local returns TODO error
```
