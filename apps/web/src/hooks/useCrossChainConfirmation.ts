/**
 * Hook to track cross-chain registration confirmation, for wallets and transaction batches.
 *
 * After a spoke chain transaction is confirmed, this hook polls the hub chain to verify the
 * registration was delivered and processed.
 *
 * Flow:
 * 1. Spoke tx confirms → enabled becomes true
 * 2. Polls the hub registry every N seconds:
 *    - `wallet`: `isWalletRegistered(wallet)` on WalletRegistry
 *    - `transaction`: `isTransactionRegistered(sampleTxHash, chainId)` on FraudRegistryHub,
 *      using one hash out of the batch as a sentinel for the whole batch
 * 3. Returns 'confirmed' when the hub reflects the registration
 * 4. Returns 'timeout' if max polling time exceeded
 *
 * Status is DERIVED from inputs, not stored. This avoids cascading renders and satisfies the
 * react-hooks/set-state-in-effect lint rule.
 *
 * The two registries were separate hooks — same polling structure, same `prevStatusRef`, same
 * interval handling, same hub-chain fallback — until they were merged here. Everything that
 * differs between them is confined to {@link registryQuery}; everything below it is the shared
 * machinery neither copy should be allowed to drift on again.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { parseAbi } from 'viem';
import { useReadContract } from 'wagmi';
import { getWalletRegistryAddress, getFraudRegistryHubAddress } from '@swr/chains';
import { getHubChainId, isSpokeChain } from '@/lib/chains/config';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/**
 * Minimal ABI for isWalletRegistered(address) to avoid viem ambiguity
 * with the string overload isWalletRegistered(string).
 */
const isWalletRegisteredAbi = parseAbi([
  'function isWalletRegistered(address wallet) view returns (bool)',
]);

/**
 * Minimal ABI for isTransactionRegistered(bytes32,bytes32).
 * Uses parseAbi to avoid potential resolution issues with the full FraudRegistryHub ABI,
 * matching the defensive pattern used for wallets.
 */
const isTransactionRegisteredAbi = parseAbi([
  'function isTransactionRegistered(bytes32 txHash, bytes32 chainId) view returns (bool)',
]);

export type CrossChainStatus =
  | 'idle' // Not started
  | 'waiting' // Spoke tx confirmed, waiting to start polling
  | 'polling' // Actively polling hub chain
  | 'confirmed' // Hub chain reflects the registration
  | 'timeout'; // Max polling time exceeded (transient errors handled via timeout)

interface CrossChainConfirmationBaseOptions {
  /** The spoke chain ID where the transaction was submitted */
  spokeChainId: number | undefined;
  /** Whether to start polling (typically after spoke tx confirms) */
  enabled: boolean;
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max polling duration in ms (default: 120000 = 2 minutes) */
  maxPollingTime?: number;
}

export interface WalletCrossChainConfirmationOptions extends CrossChainConfirmationBaseOptions {
  registry: 'wallet';
  /** The wallet address being registered */
  wallet: Address | undefined;
}

export interface TransactionCrossChainConfirmationOptions extends CrossChainConfirmationBaseOptions {
  registry: 'transaction';
  /** A single tx hash from the batch to use as a sentinel for hub registration lookup */
  sampleTxHash: Hash | undefined;
  /** The reported chain ID hash (CAIP-2 keccak256) */
  reportedChainId: Hex | undefined;
}

export type UseCrossChainConfirmationOptions =
  | WalletCrossChainConfirmationOptions
  | TransactionCrossChainConfirmationOptions;

export interface UseCrossChainConfirmationResult {
  /** Current status of cross-chain confirmation */
  status: CrossChainStatus;
  /** Whether the hub chain reflects the registration */
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

/** Everything that depends on WHICH registry is being confirmed. */
interface RegistryQuery {
  /** The hub contract holding the answer, or undefined when it cannot be resolved. */
  address: Address | undefined;
  abi: typeof isWalletRegisteredAbi | typeof isTransactionRegisteredAbi;
  functionName: 'isWalletRegistered' | 'isTransactionRegistered';
  /** undefined when a required input is missing, which also disables the query. */
  args: readonly [Address] | readonly [Hash, Hex] | undefined;
  /** Identifies the subject in logs — the wallet, or the batch's sentinel tx hash. */
  subject: string | undefined;
}

/**
 * Resolve the hub contract, ABI and args for the registry being confirmed.
 *
 * A throw from the address lookup is swallowed into `undefined`, which disables the query
 * rather than tearing down the component: a chain with no deployment yet is a configuration
 * gap, not a runtime failure of the flow the user is in.
 */
function registryQuery(
  options: UseCrossChainConfirmationOptions,
  hubChainId: number | undefined
): RegistryQuery {
  const resolveAddress = (get: (chainId: number) => Address): Address | undefined => {
    if (!hubChainId) return undefined;
    try {
      return get(hubChainId);
    } catch (err) {
      logger.registration.warn('Failed to get hub registry address', {
        registry: options.registry,
        hubChainId,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  };

  if (options.registry === 'wallet') {
    return {
      address: resolveAddress(getWalletRegistryAddress),
      abi: isWalletRegisteredAbi,
      functionName: 'isWalletRegistered',
      args: options.wallet ? ([options.wallet] as const) : undefined,
      subject: options.wallet,
    };
  }

  // The RegistryHub, not the subregistry.
  return {
    address: resolveAddress(getFraudRegistryHubAddress),
    abi: isTransactionRegisteredAbi,
    functionName: 'isTransactionRegistered',
    args:
      options.sampleTxHash && options.reportedChainId
        ? ([options.sampleTxHash, options.reportedChainId] as const)
        : undefined,
    subject: options.sampleTxHash,
  };
}

export function useCrossChainConfirmation(
  options: UseCrossChainConfirmationOptions
): UseCrossChainConfirmationResult {
  const {
    registry,
    spokeChainId,
    enabled,
    pollInterval = DEFAULT_POLL_INTERVAL,
    maxPollingTime = DEFAULT_MAX_POLLING_TIME,
  } = options;

  // Elapsed time tracked as state - only updated via interval callback (async)
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<CrossChainStatus>('idle');

  // The registry to poll always lives on the hub. `getHubChainId` returns undefined when the
  // chain IS the hub, so falling back to the chain itself is what makes this usable as a
  // same-chain confirmation as well as a cross-chain one.
  //
  // Without that fallback the query is disabled on a hub chain (no hub id → no registry
  // address → `enabled: false`), so it never confirms and silently runs to `timeout` after
  // the full polling window. Callers that gate on `needsCrossChainConfirmation` never noticed
  // because they only enable this on spokes; the P2P flow, which relies on it as the on-chain
  // check that a registration actually happened, did.
  const hubChainId = spokeChainId ? (getHubChainId(spokeChainId) ?? spokeChainId) : undefined;

  const query = registryQuery(options, hubChainId);
  const { address: hubRegistryAddress, abi, functionName, args, subject } = query;

  /**
   * Stable identity for "what is being confirmed", used as the restart trigger.
   *
   * `args` is a fresh array every render, so depending on it directly would restart the timer
   * on every render. The joined form changes exactly when the subject does — which for the
   * transaction registry includes the reported chain, not just the sentinel hash.
   */
  const argsKey = args?.join(':');

  // Determine if we should be actively auto-polling.
  // Don't stop at timeout — keep polling so late-arriving confirmations are detected. Status
  // still derives 'timeout' at maxPollingTime, but polling continues and can transition to
  // 'confirmed' if the hub eventually reflects the registration.
  const shouldPoll = enabled && elapsedTime >= INITIAL_DELAY;

  // Query the hub chain. Uses a minimal ABI to avoid viem resolution ambiguity.
  const {
    data: isRegisteredOnHubRaw,
    refetch,
    isError: isQueryError,
    error: queryError,
  } = useReadContract({
    address: hubRegistryAddress,
    abi,
    functionName,
    args,
    chainId: hubChainId,
    query: {
      // Keep enabled independent of shouldPoll so manual refetch() works after timeout
      enabled: enabled && !!args && !!hubChainId && !!hubRegistryAddress,
      refetchInterval: shouldPoll ? pollInterval : false,
      staleTime: 1000, // Consider data stale after 1 second
    },
  });

  // Coerce to boolean - the hub reads return boolean
  const isRegisteredOnHub =
    typeof isRegisteredOnHubRaw === 'boolean' ? isRegisteredOnHubRaw : false;

  // Log initialization and diagnostics for debugging
  useEffect(() => {
    if (enabled && subject) {
      logger.registration.debug('Cross-chain confirmation initialized', {
        registry,
        subject,
        hubChainId,
        hubRegistryAddress,
      });
    }
  }, [enabled, registry, subject, hubChainId, hubRegistryAddress]);

  // Log raw query results for diagnosing polling issues
  useEffect(() => {
    if (!enabled || !shouldPoll) return;
    if (isRegisteredOnHubRaw !== undefined || isQueryError) {
      logger.registration.debug('Cross-chain poll result', {
        registry,
        subject,
        rawValue: String(isRegisteredOnHubRaw),
        rawType: typeof isRegisteredOnHubRaw,
        isError: isQueryError,
        errorMsg: queryError?.message?.slice(0, 200),
      });
    }
  }, [enabled, shouldPoll, registry, subject, isRegisteredOnHubRaw, isQueryError, queryError]);

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
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      // Reset elapsed time asynchronously to avoid synchronous setState in effect. Without
      // this a re-enabled run inherits the previous run's elapsed time and can derive
      // 'timeout' on its first render, before it has polled once.
      queueMicrotask(() => setElapsedTime(0));
      return;
    }

    // Starting fresh - set start time and reset status tracking
    startTimeRef.current = Date.now();
    prevStatusRef.current = 'idle';

    logger.registration.info('Starting cross-chain confirmation polling', {
      registry,
      subject,
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
  }, [enabled, registry, subject, argsKey, spokeChainId, hubChainId, pollInterval, maxPollingTime]);

  // Log status transitions (read-only effect - no setState, so no lint error)
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      if (status === 'confirmed') {
        logger.registration.info('Cross-chain confirmation received!', {
          registry,
          subject,
          hubChainId,
          elapsedTime,
        });
      }
      if (status === 'timeout') {
        logger.registration.warn('Cross-chain confirmation timeout', {
          registry,
          subject,
          elapsedTime,
          maxPollingTime,
        });
      }
      if (status === 'polling' && prevStatusRef.current === 'waiting') {
        logger.registration.debug('Cross-chain polling started', {
          registry,
          subject,
          hubChainId,
        });
      }
      prevStatusRef.current = status;
    }
  }, [status, registry, subject, hubChainId, elapsedTime, maxPollingTime]);

  // Log query errors (read-only, no setState)
  useEffect(() => {
    if (status === 'polling' && isQueryError) {
      logger.registration.error('Cross-chain confirmation query error', {
        registry,
        subject,
        hubChainId,
      });
      // Don't immediately fail - could be transient network issue
      // Let timeout handle persistent failures
    }
  }, [status, isQueryError, registry, subject, hubChainId]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Reset the hook state. Polling stops and status returns to 'waiting'.
   * To restart polling, toggle `enabled` to false then back to true.
   */
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
    isRegisteredOnHub,
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
