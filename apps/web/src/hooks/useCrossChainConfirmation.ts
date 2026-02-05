/**
 * Hook to track cross-chain registration confirmation.
 *
 * After a spoke chain transaction is confirmed, this hook polls the hub chain
 * to verify the registration was delivered and processed.
 *
 * Flow:
 * 1. Spoke tx confirms → enabled becomes true
 * 2. Polls hub chain isRegistered(wallet) every N seconds
 * 3. Returns 'confirmed' when hub shows wallet as registered
 * 4. Returns 'timeout' if max polling time exceeded
 *
 * Status is DERIVED from inputs, not stored. This avoids cascading renders
 * and satisfies the react-hooks/set-state-in-effect lint rule.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { walletRegistryV2Abi } from '@/lib/contracts/abis';
import { getWalletRegistryV2Address } from '@/lib/contracts/addresses';
import { getHubChainId, isSpokeChain } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

export type CrossChainStatus =
  | 'idle' // Not started
  | 'waiting' // Spoke tx confirmed, waiting to start polling
  | 'polling' // Actively polling hub chain
  | 'confirmed' // Hub chain shows wallet as registered
  | 'timeout'; // Max polling time exceeded (transient errors handled via timeout)

export interface UseCrossChainConfirmationOptions {
  /** The wallet address being registered */
  wallet: Address | undefined;
  /** The spoke chain ID where the transaction was submitted */
  spokeChainId: number | undefined;
  /** Whether to start polling (typically after spoke tx confirms) */
  enabled: boolean;
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max polling duration in ms (default: 120000 = 2 minutes) */
  maxPollingTime?: number;
}

export interface UseCrossChainConfirmationResult {
  /** Current status of cross-chain confirmation */
  status: CrossChainStatus;
  /** Whether the hub chain shows the wallet as registered */
  isRegisteredOnHub: boolean;
  /** Time elapsed since polling started (ms) */
  elapsedTime: number;
  /** Manually trigger a refresh of hub status */
  refresh: () => void;
  /** Reset the hook state */
  reset: () => void;
}

const DEFAULT_POLL_INTERVAL = 3000; // 3 seconds
const DEFAULT_MAX_POLLING_TIME = 120000; // 2 minutes
const INITIAL_DELAY = 1000; // 1 second delay before polling starts

export function useCrossChainConfirmation({
  wallet,
  spokeChainId,
  enabled,
  pollInterval = DEFAULT_POLL_INTERVAL,
  maxPollingTime = DEFAULT_MAX_POLLING_TIME,
}: UseCrossChainConfirmationOptions): UseCrossChainConfirmationResult {
  // Elapsed time tracked as state - only updated via interval callback (async)
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<CrossChainStatus>('idle');

  // Get the hub chain ID for this spoke
  const hubChainId = spokeChainId ? getHubChainId(spokeChainId) : undefined;

  // Get hub registry address
  let hubRegistryAddress: Address | undefined;
  try {
    if (hubChainId) {
      hubRegistryAddress = getWalletRegistryV2Address(hubChainId);
    }
  } catch (err) {
    logger.registration.warn('Failed to get hub registry address', {
      hubChainId,
      error: err instanceof Error ? err.message : String(err),
    });
    hubRegistryAddress = undefined;
  }

  // Determine if we should be actively polling
  const shouldPoll = enabled && elapsedTime >= INITIAL_DELAY;

  // Query hub chain for registration status
  // Note: WalletRegistryV2 has overloaded isWalletRegistered(address) and isWalletRegistered(string caip10)
  // We use the address version here
  const {
    data: isRegisteredOnHubRaw,
    refetch,
    isError: isQueryError,
  } = useReadContract({
    address: hubRegistryAddress,
    abi: walletRegistryV2Abi,
    functionName: 'isWalletRegistered',
    args: wallet ? [wallet] : undefined,
    chainId: hubChainId,
    query: {
      enabled: enabled && !!wallet && !!hubChainId && !!hubRegistryAddress,
      refetchInterval: shouldPoll ? pollInterval : false,
      staleTime: 1000, // Consider data stale after 1 second
    },
  });

  // Coerce to boolean - wagmi returns boolean for isWalletRegistered(address)
  const isRegisteredOnHub =
    typeof isRegisteredOnHubRaw === 'boolean' ? isRegisteredOnHubRaw : false;

  // DERIVE status from inputs - no useState for status
  const status: CrossChainStatus = useMemo(() => {
    if (!enabled) return 'idle';
    if (isRegisteredOnHub === true) return 'confirmed';
    if (elapsedTime >= maxPollingTime) return 'timeout';
    if (elapsedTime < INITIAL_DELAY) return 'waiting';
    return 'polling';
  }, [enabled, isRegisteredOnHub, elapsedTime, maxPollingTime]);

  // Start elapsed time tracking when enabled becomes true
  useEffect(() => {
    if (!enabled) {
      // Cleanup when disabled - clear interval and refs
      // NOTE: We intentionally do NOT call setElapsedTime(0) here
      // to avoid synchronous setState in effect body (lint rule).
      // The stale elapsedTime value doesn't matter when !enabled (status = 'idle').
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      return;
    }

    // Starting fresh - set start time (but don't call setState synchronously)
    startTimeRef.current = Date.now();

    logger.registration.info('Starting cross-chain confirmation polling', {
      wallet,
      spokeChainId,
      hubChainId,
      pollInterval,
      maxPollingTime,
    });

    // Update elapsed time in interval callback (async - satisfies lint rule)
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Date.now() - startTimeRef.current);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
    };
  }, [enabled, wallet, spokeChainId, hubChainId, pollInterval, maxPollingTime]);

  // Log status transitions (read-only effect - no setState, so no lint error)
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      if (status === 'confirmed') {
        logger.registration.info('Cross-chain confirmation received!', {
          wallet,
          hubChainId,
          elapsedTime,
        });
      }
      if (status === 'timeout') {
        logger.registration.warn('Cross-chain confirmation timeout', {
          wallet,
          elapsedTime,
          maxPollingTime,
        });
      }
      if (status === 'polling' && prevStatusRef.current === 'waiting') {
        logger.registration.debug('Cross-chain polling started', {
          wallet,
          hubChainId,
        });
      }
      prevStatusRef.current = status;
    }
  }, [status, wallet, hubChainId, elapsedTime, maxPollingTime]);

  // Log query errors (read-only, no setState)
  useEffect(() => {
    if (status === 'polling' && isQueryError) {
      logger.registration.error('Cross-chain confirmation query error', {
        wallet,
        hubChainId,
      });
      // Don't immediately fail - could be transient network issue
      // Let timeout handle persistent failures
    }
  }, [status, isQueryError, wallet, hubChainId]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Reset elapsed time (this is called from event handler, not effect, so OK)
    setElapsedTime(0);
  }, []);

  return {
    status,
    isRegisteredOnHub: isRegisteredOnHub ?? false,
    elapsedTime,
    refresh,
    reset,
  };
}

/**
 * Check if a chain requires cross-chain confirmation.
 * Hub chains don't need it - registration is local.
 * Spoke chains need to wait for hub delivery.
 */
export function needsCrossChainConfirmation(chainId: number | undefined): boolean {
  if (!chainId) return false;
  return isSpokeChain(chainId);
}
