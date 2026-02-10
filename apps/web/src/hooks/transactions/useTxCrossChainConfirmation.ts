/**
 * Hook to track cross-chain transaction batch registration confirmation.
 *
 * After a spoke chain transaction is confirmed, this hook polls the hub chain
 * to verify the transaction batch registration was delivered and processed.
 *
 * Flow:
 * 1. Spoke tx confirms → enabled becomes true
 * 2. Polls hub chain isTransactionRegistered(sampleTxHash, chainId) every N seconds
 * 3. Returns 'confirmed' when hub shows the tx as registered (sentinel for batch)
 * 4. Returns 'timeout' if max polling time exceeded
 *
 * Status is DERIVED from inputs, not stored. This avoids cascading renders
 * and satisfies the react-hooks/set-state-in-effect lint rule.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { parseAbi } from 'viem';
import { useReadContract } from 'wagmi';
import { getFraudRegistryHubAddress } from '@/lib/contracts/addresses';
import { getHubChainId, isSpokeChain } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/**
 * Minimal ABI for isTransactionRegistered(bytes32,bytes32).
 * Uses parseAbi to avoid potential resolution issues with the full FraudRegistryHub ABI,
 * matching the defensive pattern used by useCrossChainConfirmation for wallets.
 */
const isTransactionRegisteredAbi = parseAbi([
  'function isTransactionRegistered(bytes32 txHash, bytes32 chainId) view returns (bool)',
]);

export type TxCrossChainStatus =
  | 'idle' // Not started
  | 'waiting' // Spoke tx confirmed, waiting to start polling
  | 'polling' // Actively polling hub chain
  | 'confirmed' // Hub chain shows batch as registered
  | 'timeout'; // Max polling time exceeded (transient errors handled via timeout)

export interface UseTxCrossChainConfirmationOptions {
  /** A single tx hash from the batch to use as a sentinel for hub registration lookup */
  sampleTxHash: Hash | undefined;
  /** The reported chain ID hash (CAIP-2 keccak256) */
  reportedChainId: Hex | undefined;
  /** The spoke chain ID where the transaction was submitted */
  spokeChainId: number | undefined;
  /** Whether to start polling (typically after spoke tx confirms) */
  enabled: boolean;
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max polling duration in ms (default: 120000 = 2 minutes) */
  maxPollingTime?: number;
}

export interface UseTxCrossChainConfirmationResult {
  /** Current status of cross-chain confirmation */
  status: TxCrossChainStatus;
  /** Whether the hub chain shows the batch as registered */
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

export function useTxCrossChainConfirmation({
  sampleTxHash,
  reportedChainId,
  spokeChainId,
  enabled,
  pollInterval = DEFAULT_POLL_INTERVAL,
  maxPollingTime = DEFAULT_MAX_POLLING_TIME,
}: UseTxCrossChainConfirmationOptions): UseTxCrossChainConfirmationResult {
  // Elapsed time tracked as state - only updated via interval callback (async)
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<TxCrossChainStatus>('idle');

  // Get the hub chain ID for this spoke
  const hubChainId = spokeChainId ? getHubChainId(spokeChainId) : undefined;

  // Get hub registry address (RegistryHub, not the subregistry)
  let hubRegistryAddress: Address | undefined;
  try {
    if (hubChainId) {
      hubRegistryAddress = getFraudRegistryHubAddress(hubChainId);
    }
  } catch (err) {
    logger.registration.warn('Failed to get hub registry address for tx batch', {
      hubChainId,
      error: err instanceof Error ? err.message : String(err),
    });
    hubRegistryAddress = undefined;
  }

  // Determine if we should be actively auto-polling
  // Don't stop at timeout — keep polling so late-arriving confirmations are detected.
  // Status still derives 'timeout' at maxPollingTime, but polling continues and can
  // transition to 'confirmed' if the hub eventually reflects the registration.
  // Matches wallet hook (useCrossChainConfirmation) behavior.
  const shouldPoll = enabled && elapsedTime >= INITIAL_DELAY;

  // Query hub chain for transaction registration using an actual tx hash from the batch.
  // Uses minimal ABI to avoid potential viem resolution issues with the full FraudRegistryHub ABI.
  const {
    data: isRegisteredOnHubRaw,
    refetch,
    isError: isQueryError,
    error: queryError,
  } = useReadContract({
    address: hubRegistryAddress,
    abi: isTransactionRegisteredAbi,
    functionName: 'isTransactionRegistered',
    args: sampleTxHash && reportedChainId ? [sampleTxHash, reportedChainId] : undefined,
    chainId: hubChainId,
    query: {
      // Keep enabled independent of shouldPoll so manual refetch() works after timeout
      enabled:
        enabled && !!sampleTxHash && !!reportedChainId && !!hubChainId && !!hubRegistryAddress,
      refetchInterval: shouldPoll ? pollInterval : false,
      staleTime: 1000, // Consider data stale after 1 second
    },
  });

  // Coerce to boolean
  const isRegisteredOnHub =
    typeof isRegisteredOnHubRaw === 'boolean' ? isRegisteredOnHubRaw : false;

  // Log initialization and diagnostics for debugging
  useEffect(() => {
    if (enabled && sampleTxHash) {
      logger.registration.debug('Cross-chain tx batch confirmation initialized', {
        sampleTxHash,
        reportedChainId,
        hubChainId,
        hubRegistryAddress,
      });
    }
  }, [enabled, sampleTxHash, reportedChainId, hubChainId, hubRegistryAddress]);

  // Log raw query results for diagnosing polling issues
  useEffect(() => {
    if (!enabled || !shouldPoll) return;
    if (isRegisteredOnHubRaw !== undefined || isQueryError) {
      logger.registration.debug('Cross-chain tx poll result', {
        rawValue: String(isRegisteredOnHubRaw),
        rawType: typeof isRegisteredOnHubRaw,
        isError: isQueryError,
        errorMsg: queryError?.message?.slice(0, 200),
        sampleTxHash,
        reportedChainId,
      });
    }
  }, [
    enabled,
    shouldPoll,
    isRegisteredOnHubRaw,
    isQueryError,
    queryError,
    sampleTxHash,
    reportedChainId,
  ]);

  // DERIVE status from inputs - no useState for status
  const status: TxCrossChainStatus = useMemo(() => {
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
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      // Reset elapsed time asynchronously to avoid synchronous setState in effect
      // This clears stale state while satisfying the react-hooks lint rule
      queueMicrotask(() => setElapsedTime(0));
      return;
    }

    // Starting fresh - set start time and reset status tracking
    startTimeRef.current = Date.now();
    prevStatusRef.current = 'idle';

    logger.registration.info('Starting cross-chain tx batch confirmation polling', {
      sampleTxHash,
      reportedChainId,
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
  }, [
    enabled,
    sampleTxHash,
    reportedChainId,
    spokeChainId,
    hubChainId,
    pollInterval,
    maxPollingTime,
  ]);

  // Log status transitions (read-only effect - no setState, so no lint error)
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      if (status === 'confirmed') {
        logger.registration.info('Cross-chain tx batch confirmation received!', {
          sampleTxHash,
          hubChainId,
          elapsedTime,
        });
      }
      if (status === 'timeout') {
        logger.registration.warn('Cross-chain tx batch confirmation timeout', {
          sampleTxHash,
          elapsedTime,
          maxPollingTime,
        });
      }
      if (status === 'polling' && prevStatusRef.current === 'waiting') {
        logger.registration.debug('Cross-chain tx batch polling started', {
          sampleTxHash,
          hubChainId,
        });
      }
      prevStatusRef.current = status;
    }
  }, [status, sampleTxHash, hubChainId, elapsedTime, maxPollingTime]);

  // Log query errors (read-only, no setState)
  useEffect(() => {
    if (status === 'polling' && isQueryError) {
      logger.registration.error('Cross-chain tx batch confirmation query error', {
        sampleTxHash,
        hubChainId,
      });
      // Don't immediately fail - could be transient network issue
      // Let timeout handle persistent failures
    }
  }, [status, isQueryError, sampleTxHash, hubChainId]);

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
 * Check if a chain requires cross-chain confirmation for tx batches.
 * Hub chains don't need it - registration is local.
 * Spoke chains need to wait for hub delivery.
 */
export function needsTxCrossChainConfirmation(chainId: number | undefined): boolean {
  if (!chainId) return false;
  return isSpokeChain(chainId);
}
