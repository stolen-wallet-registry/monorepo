/**
 * TanStack Query key factory for registry contract reads.
 *
 * Provides type-safe, hierarchical query keys for consistent cache management.
 * Use these keys with wagmi's useReadContract query option for:
 * - Consistent stale times across hooks
 * - Easy cache invalidation after successful transactions
 *
 * @example
 * // In a hook
 * const result = useReadContract({
 *   ...config,
 *   query: { queryKey: registryKeys.nonce(address) }
 * });
 *
 * @example
 * // Invalidate after registration
 * queryClient.invalidateQueries({ queryKey: registryKeys.all });
 */

import type { SignatureStep } from '@/lib/signatures';
import type { Address } from '@/lib/types/ethereum';

/**
 * Query key factory for StolenWalletRegistry contract reads.
 */
export const registryKeys = {
  /** Root key for all registry queries */
  all: ['registry'] as const,

  /** Key for nonce queries */
  nonces: () => [...registryKeys.all, 'nonce'] as const,
  nonce: (address: Address) => [...registryKeys.nonces(), address] as const,

  /** Key for deadline queries */
  deadlines: () => [...registryKeys.all, 'deadlines'] as const,
  deadline: (address: Address) => [...registryKeys.deadlines(), address] as const,

  /** Key for hash struct queries (includes step) */
  hashStructs: () => [...registryKeys.all, 'hashStruct'] as const,
  hashStruct: (forwarder: Address, step: SignatureStep) =>
    [...registryKeys.hashStructs(), forwarder, step] as const,

  /** Key for registration status queries */
  registrations: () => [...registryKeys.all, 'registration'] as const,
  isRegistered: (address: Address) =>
    [...registryKeys.registrations(), 'isRegistered', address] as const,
  getRegistration: (address: Address) =>
    [...registryKeys.registrations(), 'getRegistration', address] as const,

  /** Key for pending status queries */
  pending: () => [...registryKeys.all, 'pending'] as const,
  isPending: (address: Address) => [...registryKeys.pending(), 'isPending', address] as const,
  getAcknowledgement: (address: Address) =>
    [...registryKeys.pending(), 'getAcknowledgement', address] as const,

  /** Combined status query (batched isRegistered + isPending + data) */
  status: (address: Address, chainId?: number) =>
    chainId !== undefined
      ? ([...registryKeys.all, 'status', chainId, address] as const)
      : ([...registryKeys.all, 'status', address] as const),
} as const;

/**
 * Default stale times for registry queries (in milliseconds).
 *
 * These values balance freshness with performance:
 * - Nonces change infrequently (only after successful tx)
 * - Deadlines need to be fresh for grace period timing
 * - Hash structs include deadlines, so shorter stale time
 */
export const registryStaleTime = {
  /** Nonce rarely changes - 30 seconds */
  nonce: 30_000,
  /** Deadlines need frequent updates during grace period - 5 seconds */
  deadlines: 5_000,
  /** Hash struct includes deadline - 10 seconds */
  hashStruct: 10_000,
  /** Registration status rarely changes - 60 seconds */
  isRegistered: 60_000,
  /** Pending status - 30 seconds (changes during registration flow) */
  isPending: 30_000,
  /** Combined status query - 30 seconds */
  status: 30_000,
} as const;
