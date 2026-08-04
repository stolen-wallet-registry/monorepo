/**
 * TanStack Query keys and cache invalidation for registry contract reads.
 *
 * Most registry reads go through wagmi's `useReadContract`, which owns its own query key
 * (`['readContract', {...}]`) — supplying a custom `queryKey` there means hand-maintaining
 * the parameter fingerprint wagmi already computes, and getting it subtly wrong means a
 * cache that never matches. So this module does NOT try to mirror every read as a key
 * builder. It keeps the one key we do supply explicitly (`status`, used by
 * `useRegistryStatus`) and a single invalidation entry point that covers both shapes.
 *
 * The dead key builders that used to live here (nonce, deadline, hashStruct, isRegistered,
 * isPending, getAcknowledgement …) were never passed to any `useReadContract` call, so
 * invalidating them would have invalidated nothing. They are gone rather than left as a
 * half-wired factory that reads as working cache management.
 */

import type { QueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

/**
 * Query key factory for registry reads whose keys we supply ourselves.
 */
export const registryKeys = {
  /** Root key for all registry queries */
  all: ['registry'] as const,

  /** Combined status query (batched isRegistered + isPending + data) */
  status: (address: Address, chainId?: number) =>
    chainId !== undefined
      ? ([...registryKeys.all, 'status', chainId, address] as const)
      : ([...registryKeys.all, 'status', address] as const),
} as const;

/**
 * Root key wagmi uses for every `useReadContract` query.
 *
 * Invalidating this refetches nonces, deadlines, hash structs, registration status and fee
 * quotes together. That is intentionally broad: after a registration transaction confirms,
 * every one of those reads is potentially stale, and the reads are cheap relative to a user
 * signing a second message against a nonce the chain has already consumed.
 */
const WAGMI_READ_CONTRACT_KEY = ['readContract'] as const;

/**
 * Invalidate every registry-derived cache after a transaction confirms.
 *
 * This is the fix for the stale-nonce class of bugs at its root. Nothing in the app used to
 * invalidate anything after a registration transaction: the acknowledgement would confirm,
 * the contract nonce would increment, and the cached nonce would keep serving the old value
 * to the next signing step until its staleTime happened to elapse. Sign-time refetches
 * patched individual symptoms; this removes the cause.
 *
 * @param queryClient - The app's QueryClient (from `useQueryClient()`)
 * @param context - Free-form context for the log line (step, tx hash, address)
 */
export function invalidateRegistryQueries(
  queryClient: QueryClient,
  context?: Record<string, unknown>
): void {
  logger.contract.info('Invalidating registry query caches after confirmation', context);
  void queryClient.invalidateQueries({ queryKey: WAGMI_READ_CONTRACT_KEY });
  void queryClient.invalidateQueries({ queryKey: registryKeys.all });
}

/**
 * Default stale times for registry queries (in milliseconds).
 */
export const registryStaleTime = {
  /** Combined status query - 30 seconds */
  status: 30_000,
} as const;
