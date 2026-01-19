/**
 * Hook to track cross-chain transaction batch registration confirmation.
 *
 * After a spoke chain transaction is confirmed, this hook polls the hub chain
 * to verify the transaction batch registration was delivered and processed.
 *
 * Flow:
 * 1. Spoke tx confirms → enabled becomes true
 * 2. Polls hub chain isTransactionBatchRegistered(merkleRoot) every N seconds
 * 3. Returns 'confirmed' when hub shows batch as registered
 * 4. Returns 'timeout' if max polling time exceeded
 *
 * Status is DERIVED from inputs, not stored. This avoids cascading renders
 * and satisfies the react-hooks/set-state-in-effect lint rule.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import { registryHubAbi } from '@/lib/contracts/abis';
import { getRegistryHubAddress } from '@/lib/contracts/addresses';
import { getHubChainId, isSpokeChain } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

export type TxCrossChainStatus =
  | 'idle' // Not started
  | 'waiting' // Spoke tx confirmed, waiting to start polling
  | 'polling' // Actively polling hub chain
  | 'confirmed' // Hub chain shows batch as registered
  | 'timeout'; // Max polling time exceeded (transient errors handled via timeout)

export interface UseTxCrossChainConfirmationOptions {
  /** The merkle root of the transaction batch being registered */
  merkleRoot: Hash | undefined;
  /** The reporter address who signed the registration */
  reporter: Address | undefined;
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
  merkleRoot,
  reporter,
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

  // Compute the batchId: keccak256(abi.encode(merkleRoot, reporter, reportedChainId))
  // This must match the contract's _computeBatchId function
  const batchId = useMemo(() => {
    if (!merkleRoot || !reporter || !reportedChainId) return undefined;
    try {
      return keccak256(
        encodeAbiParameters(parseAbiParameters('bytes32, address, bytes32'), [
          merkleRoot as `0x${string}`,
          reporter as `0x${string}`,
          reportedChainId as `0x${string}`,
        ])
      );
    } catch (err) {
      logger.registration.error('Failed to compute batchId', {
        merkleRoot,
        reporter,
        reportedChainId,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }, [merkleRoot, reporter, reportedChainId]);

  // Get hub registry address (RegistryHub, not the subregistry)
  let hubRegistryAddress: Address | undefined;
  try {
    if (hubChainId) {
      hubRegistryAddress = getRegistryHubAddress(hubChainId);
    }
  } catch (err) {
    logger.registration.warn('Failed to get hub registry address for tx batch', {
      hubChainId,
      error: err instanceof Error ? err.message : String(err),
    });
    hubRegistryAddress = undefined;
  }

  // Determine if we should be actively auto-polling
  // Stop auto-polling once max time exceeded to avoid unnecessary network requests
  // Manual refetch() still works after timeout for user-initiated retries
  const shouldPoll = enabled && elapsedTime >= INITIAL_DELAY && elapsedTime < maxPollingTime;

  // Query hub chain for transaction batch registration status using computed batchId
  const {
    data: isRegisteredOnHub,
    refetch,
    isError: isQueryError,
  } = useReadContract({
    address: hubRegistryAddress,
    abi: registryHubAbi,
    functionName: 'isTransactionBatchRegistered',
    args: batchId ? [batchId] : undefined,
    chainId: hubChainId,
    query: {
      // Keep enabled independent of shouldPoll so manual refetch() works after timeout
      enabled: enabled && !!batchId && !!hubChainId && !!hubRegistryAddress,
      // Auto-polling stops after timeout, but manual refresh still works
      refetchInterval: shouldPoll ? pollInterval : false,
      staleTime: 1000, // Consider data stale after 1 second
    },
  });

  // Log batchId computation for debugging
  useEffect(() => {
    if (enabled && batchId) {
      logger.registration.debug('Cross-chain tx batch confirmation initialized', {
        merkleRoot,
        reporter,
        reportedChainId,
        computedBatchId: batchId,
        hubChainId,
      });
    }
  }, [enabled, batchId, merkleRoot, reporter, reportedChainId, hubChainId]);

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

    logger.registration.info('Starting cross-chain tx batch confirmation polling', {
      merkleRoot,
      reporter,
      reportedChainId,
      computedBatchId: batchId,
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
    merkleRoot,
    reporter,
    reportedChainId,
    batchId,
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
          merkleRoot,
          hubChainId,
          elapsedTime,
        });
      }
      if (status === 'timeout') {
        logger.registration.warn('Cross-chain tx batch confirmation timeout', {
          merkleRoot,
          elapsedTime,
          maxPollingTime,
        });
      }
      if (status === 'polling' && prevStatusRef.current === 'waiting') {
        logger.registration.debug('Cross-chain tx batch polling started', {
          merkleRoot,
          hubChainId,
        });
      }
      prevStatusRef.current = status;
    }
  }, [status, merkleRoot, hubChainId, elapsedTime, maxPollingTime]);

  // Log query errors (read-only, no setState)
  useEffect(() => {
    if (status === 'polling' && isQueryError) {
      logger.registration.error('Cross-chain tx batch confirmation query error', {
        merkleRoot,
        hubChainId,
      });
      // Don't immediately fail - could be transient network issue
      // Let timeout handle persistent failures
    }
  }, [status, isQueryError, merkleRoot, hubChainId]);

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
