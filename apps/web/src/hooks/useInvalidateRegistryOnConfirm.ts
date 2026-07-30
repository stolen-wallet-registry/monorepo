import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { invalidateRegistryQueries } from '@/lib/contracts/queryKeys';
import type { Hash } from '@/lib/types/ethereum';

/**
 * Refresh every registry-derived cache the moment a payment transaction confirms.
 *
 * Without this the nonce, deadlines and registration status keep serving pre-transaction
 * values to the next step — the root cause of the stale-nonce bugs that sign-time refetches
 * only papered over. Broad by design: after a confirmation, all of those reads are suspect.
 *
 * Every pay step needs exactly this, so it lives here rather than being copied into each one.
 *
 * @param step - Flow step label, for the log line only
 * @param hash - Transaction hash; nothing runs until it exists
 * @param isConfirmed - Whether the transaction has confirmed
 */
export function useInvalidateRegistryOnConfirm(
  step:
    | 'acknowledgement'
    | 'registration'
    | 'transaction-acknowledgement'
    | 'transaction-registration',
  hash: Hash | undefined,
  isConfirmed: boolean
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConfirmed || !hash) return;
    invalidateRegistryQueries(queryClient, { step, hash });
  }, [isConfirmed, hash, step, queryClient]);
}
