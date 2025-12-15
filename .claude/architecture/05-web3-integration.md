# Web3 Integration

wagmi 2.x, viem 2.x, and RainbowKit 2.x configuration.

---

## Provider Hierarchy

```
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

| Variable                        | Purpose              |
| ------------------------------- | -------------------- |
| `VITE_SEPOLIA_RPC_URL`          | Sepolia RPC endpoint |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect        |
| `VITE_CONTRACT_ADDRESS_*`       | Address overrides    |

---

## Key Files

```
apps/web/src/
├── lib/
│   ├── wagmi.ts                 # Chain config
│   ├── rainbowkit-theme.ts      # Theme integration
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
    └── useContractDeadlines.ts
```
