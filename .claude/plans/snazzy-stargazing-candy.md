# Plan: Fix Registry Search to Always Query Hub Chain

## Problem

When a user registers a wallet via cross-chain (spoke → hub), then searches for it, the search shows "Not Registered" because:

1. `useRegistryStatus` hook uses `useChainId()` to get the currently connected chain
2. If user is connected to spoke (31338), it queries the spoke registry
3. But cross-chain registrations are stored on the **hub** (31337), not the spoke
4. The spoke registry doesn't have `isRegistered()` for completed registrations - only `isPending()`

## Root Cause

```typescript
// useRegistryStatus.ts:105
const chainId = useChainId(); // Returns 31338 if connected to spoke
contractAddress = getStolenWalletRegistryAddress(chainId); // Throws for spoke chain
```

## Solution

The registry search should **always query the hub chain** for the unified registry, regardless of which chain the user is connected to.

### Option A: Add `chainId` override to `useRegistryStatus` (Recommended)

Add optional `chainId` parameter to allow callers to specify which chain to query.

### Option B: Create separate `useUnifiedRegistryStatus` hook

New hook that always queries hub chain.

## Changes (Option A)

### 1. `apps/web/src/hooks/useRegistryStatus.ts`

Add `chainId` option:

```typescript
export interface UseRegistryStatusOptions {
  address?: Address;
  refetchInterval?: number | false;
  /** Override chain ID (defaults to connected chain) */
  chainId?: number;
}

export function useRegistryStatus({
  address,
  refetchInterval = false,
  chainId: overrideChainId,
}: UseRegistryStatusOptions): RegistryStatus {
  const connectedChainId = useChainId();
  const chainId = overrideChainId ?? connectedChainId;
  // ... rest of hook
}
```

### 2. `apps/web/src/lib/chains/config.ts`

Add function to get hub chain ID:

```typescript
export function getHubChainIdForEnvironment(): number {
  // In development, use Anvil Hub
  if (import.meta.env.DEV) return 31337;
  // In production, use Base mainnet
  return 8453;
}
```

### 3. `apps/web/src/components/composed/RegistrySearch/RegistrySearch.tsx`

Pass hub chain ID to hook:

```typescript
import { getHubChainIdForEnvironment } from '@/lib/chains/config';

const registryStatus = useRegistryStatus({
  address: searchAddress,
  chainId: getHubChainIdForEnvironment(), // Always query hub
});
```

### 4. `apps/web/src/pages/SearchPage.tsx` (if applicable)

Same change if it uses `useRegistryStatus` directly.

## Files to Modify

1. `apps/web/src/hooks/useRegistryStatus.ts` - Add chainId override
2. `apps/web/src/lib/chains/config.ts` - Add getHubChainIdForEnvironment()
3. `apps/web/src/components/composed/RegistrySearch/RegistrySearch.tsx` - Pass hub chainId
4. Any other components using useRegistryStatus for unified registry queries

## Testing

1. Connect to spoke chain (31338)
2. Register a wallet via cross-chain flow
3. Search for the wallet - should now show as registered
4. Connect to hub chain (31337) - search should still work
