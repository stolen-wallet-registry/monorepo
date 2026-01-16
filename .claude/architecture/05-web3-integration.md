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

export const localhost: Chain = {
  id: 31337,
  name: 'Localhost',
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
};

export const config = createConfig({
  chains: [localhost, sepolia],
  connectors: [injected(), walletConnect({ projectId })],
  transports: {
    [localhost.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(getSepoliaRpcUrl()),
  },
});
```

---

## Contract Config

```typescript
// apps/web/src/lib/contracts/addresses.ts

export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [localhost.id]: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
  [sepolia.id]: '0x0000000000000000000000000000000000000000', // TODO
};

export function getContractAddress(chainId: number): `0x${string}` {
  // Supports VITE_CONTRACT_ADDRESS_* env overrides
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

| Variable                        | Purpose                           |
| ------------------------------- | --------------------------------- |
| `VITE_ALCHEMY_API_KEY`          | Alchemy API for tx fetching       |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect                     |
| `VITE_CONTRACT_ADDRESS_*`       | Address overrides                 |
| `VITE_TESTNET`                  | Use testnets instead of localhost |
| `VITE_CROSSCHAIN`               | Enable cross-chain mode           |

---

## Alchemy SDK Integration

Used for fetching user transaction history in the Stolen Transaction Registry.

**Setup:**

1. Create account at https://dashboard.alchemy.com
2. Create an app
3. Enable networks: Base, Optimism, Arbitrum, Polygon (and testnets)
4. Copy API key to `VITE_ALCHEMY_API_KEY`

**SDK handles network routing automatically:**

```typescript
import { Alchemy, Network } from 'alchemy-sdk';

// Single API key works for all networks
const alchemy = new Alchemy({
  apiKey: import.meta.env.VITE_ALCHEMY_API_KEY,
  network: Network.BASE_MAINNET, // SDK builds correct URL
});

// Internally constructs: https://base-mainnet.g.alchemy.com/v2/{key}
```

**Supported Networks:**

| Network          | SDK Enum                | Endpoint                                         |
| ---------------- | ----------------------- | ------------------------------------------------ |
| Ethereum         | `Network.ETH_MAINNET`   | `https://eth-mainnet.g.alchemy.com/v2/{key}`     |
| Base             | `Network.BASE_MAINNET`  | `https://base-mainnet.g.alchemy.com/v2/{key}`    |
| Optimism         | `Network.OPT_MAINNET`   | `https://opt-mainnet.g.alchemy.com/v2/{key}`     |
| Arbitrum         | `Network.ARB_MAINNET`   | `https://arb-mainnet.g.alchemy.com/v2/{key}`     |
| Polygon          | `Network.MATIC_MAINNET` | `https://polygon-mainnet.g.alchemy.com/v2/{key}` |
| Sepolia          | `Network.ETH_SEPOLIA`   | `https://eth-sepolia.g.alchemy.com/v2/{key}`     |
| Base Sepolia     | `Network.BASE_SEPOLIA`  | `https://base-sepolia.g.alchemy.com/v2/{key}`    |
| Optimism Sepolia | `Network.OPT_SEPOLIA`   | `https://opt-sepolia.g.alchemy.com/v2/{key}`     |

**Chain ID to Network mapping:**

```typescript
// apps/web/src/lib/alchemy.ts

import { Network } from 'alchemy-sdk';

export const chainIdToAlchemyNetwork: Record<number, Network> = {
  // Mainnets
  1: Network.ETH_MAINNET,
  8453: Network.BASE_MAINNET,
  10: Network.OPT_MAINNET,
  42161: Network.ARB_MAINNET,
  137: Network.MATIC_MAINNET,
  // Testnets
  11155111: Network.ETH_SEPOLIA,
  84532: Network.BASE_SEPOLIA,
  11155420: Network.OPT_SEPOLIA,
};
```

**Fetching transactions:**

```typescript
const transfers = await alchemy.core.getAssetTransfers({
  fromAddress: userAddress,
  category: [
    AssetTransfersCategory.EXTERNAL, // ETH transfers
    AssetTransfersCategory.ERC20, // Token transfers
    AssetTransfersCategory.ERC721, // NFT transfers
    AssetTransfersCategory.ERC1155, // Multi-token transfers
  ],
  maxCount: 100,
  order: 'desc',
  withMetadata: true,
});
```

**Free tier limits:** 300M compute units/month (sufficient for development and moderate production use).

---

## Key Files

```text
apps/web/src/
├── lib/
│   ├── wagmi.ts                 # Chain config
│   ├── rainbowkit-theme.ts      # Theme integration
│   ├── alchemy.ts               # Alchemy SDK config & network mapping
│   └── contracts/
│       ├── abis.ts
│       ├── addresses.ts
│       └── queryKeys.ts
├── providers/
│   └── Web3Provider.tsx
└── hooks/
    ├── useAcknowledgement.ts
    ├── useRegistration.ts
    ├── useContractNonce.ts
    ├── useContractDeadlines.ts
    └── useUserTransactions.ts   # Transaction registry - fetches via Alchemy
```
