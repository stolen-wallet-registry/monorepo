/**
 * Hook to track cross-chain soulbound mint confirmation.
 *
 * After a spoke chain transaction is confirmed, this hook polls the hub chain
 * to verify the soulbound token was actually minted.
 *
 * Flow:
 * 1. Spoke tx confirms → extract messageId from logs
 * 2. Poll hub chain hasMinted(wallet) or check token balance
 * 3. Returns 'confirmed' when hub shows token minted
 * 4. Returns 'timeout' if max polling time exceeded
 *
 * DESIGN NOTE — what is state and what is derived
 * ------------------------------------------------
 * Everything here belongs to one *run*, identified by `runKey`
 * (spokeHash + wallet). Both pieces of state are tagged with the run they were
 * produced for, and are read back only when the tag still matches the current
 * run:
 *
 *   - `elapsedState`   the ticking stopwatch value
 *   - `messageIdState` the Hyperlane messageId pulled out of the spoke receipt
 *
 * Comparing the tag against the current `runKey` means a new spoke tx (or a new
 * wallet) invalidates both for free. That is why there is no longer a "reset
 * everything when the run changes" effect: such an effect only re-syncs state
 * *after* the render that changed the prop, so for exactly one commit the hook
 * reported the previous run's elapsed time and messageId as if they belonged to
 * the new one. Tagging closes that window structurally instead of relying on
 * effect ordering.
 *
 * `pollingActive` is gone as well: "should we still be polling" is fully
 * derivable from the clock (`elapsedTime` vs. the initial delay / max polling
 * time) and from the hub query's own data (whether it already reports a mint).
 * The latter is evaluated inside TanStack Query's `refetchInterval` callback,
 * which receives the query, so no state is needed to break the ordering cycle
 * between "the query result" and "should the query keep running".
 *
 * The two fire-once latches (`loggedConfirmationForRunRef`,
 * `loggedTimeoutForRunRef`) store the run they fired for rather than a boolean
 * that would need resetting.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { decodeEventLog } from 'viem';
import {
  spokeSoulboundForwarderAbi,
  walletSoulboundAbi,
  supportSoulboundAbi,
} from '@/lib/contracts/abis';
import { getWalletSoulboundAddress, getSupportSoulboundAddress } from '@swr/chains';
import { getHubChainIdForEnvironment } from '@/lib/chains/config';
import { getBridgeMessageByIdUrl } from '@swr/chains';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

export type SoulboundConfirmationStatus =
  | 'idle' // Not started
  | 'extracting' // Extracting messageId from receipt
  | 'waiting' // Waiting before polling
  | 'polling' // Actively polling hub chain
  | 'confirmed' // Hub chain shows token minted
  | 'timeout'; // Max polling time exceeded

export interface UseCrossChainSoulboundConfirmationOptions {
  /** The spoke transaction hash */
  spokeHash: Hash | undefined;
  /** The spoke chain ID */
  spokeChainId: number | undefined;
  /** Type of mint: 'wallet' or 'support' */
  mintType: 'wallet' | 'support';
  /** Wallet address (for wallet mint or supporter address) */
  wallet: Address | undefined;
  /** Whether to start tracking */
  enabled: boolean;
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max polling duration in ms (default: 180000 = 3 minutes) */
  maxPollingTime?: number;
}

export interface UseCrossChainSoulboundConfirmationResult {
  /** Current status */
  status: SoulboundConfirmationStatus;
  /** Hyperlane message ID (bytes32) */
  messageId: Hex | undefined;
  /** Hyperlane explorer URL */
  explorerUrl: string | undefined;
  /** Whether token is confirmed minted on hub */
  isMintedOnHub: boolean;
  /** Time elapsed since started (ms) */
  elapsedTime: number;
  /** Manually trigger refresh */
  refresh: () => void;
  /** Reset state */
  reset: () => void;
}

const DEFAULT_POLL_INTERVAL = 3000; // 3 seconds
const DEFAULT_MAX_POLLING_TIME = 180000; // 3 minutes
const INITIAL_DELAY = 2000; // 2 second delay before polling starts

/** Run-tagged stopwatch value. */
interface ElapsedState {
  runKey: string;
  ms: number;
}

/** Run-tagged Hyperlane messageId. */
interface MessageIdState {
  runKey: string;
  value: Hex;
}

/** Run-tagged balance baseline used by support mints. */
interface StartingBalance {
  runKey: string;
  value: bigint;
}

export function useCrossChainSoulboundConfirmation({
  spokeHash,
  spokeChainId,
  mintType,
  wallet,
  enabled,
  pollInterval = DEFAULT_POLL_INTERVAL,
  maxPollingTime = DEFAULT_MAX_POLLING_TIME,
}: UseCrossChainSoulboundConfirmationOptions): UseCrossChainSoulboundConfirmationResult {
  // Identifies the confirmation run. Everything below is scoped to it.
  const runKey = `${spokeHash ?? ''}-${wallet ?? ''}`;

  const [elapsedState, setElapsedState] = useState<ElapsedState>(() => ({ runKey, ms: 0 }));
  const [messageIdState, setMessageIdState] = useState<MessageIdState | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The runs for which the confirmed / timeout log lines were already emitted.
  const loggedConfirmationForRunRef = useRef<string | null>(null);
  const loggedTimeoutForRunRef = useRef<string | null>(null);
  /**
   * Run-tagged balance baseline for support mints.
   *
   * State, not a ref: `deriveIsMinted` reads it during render, so a ref would be both a
   * lint violation (`react-hooks/refs`) and genuinely wrong — writing it would not schedule
   * the re-render that turns the new baseline into a new answer. As state, recording the
   * baseline re-renders and `isMintedOnHub` is recomputed from it. The write is guarded by
   * the run tag, so it happens once per run and cannot loop.
   */
  const [startingBalance, setStartingBalance] = useState<StartingBalance | null>(null);
  /**
   * The last hub balance observed while this hook was NOT enabled — i.e. before the spoke
   * transaction that this run is confirming.
   *
   * This is what makes the baseline a genuine "before" reading. Taking it from the first hub
   * read AFTER enabling races the bridge: if the Hyperlane message is delivered before that
   * first `balanceOf` resolves, the baseline already contains the new token, `balance > baseline`
   * is never true, and a mint that actually succeeded runs the full three-minute window to
   * `timeout`. Support mints therefore keep the hub query alive while idle (see the query's
   * `enabled`) purely so this ref is populated by the time a mint starts.
   *
   * Null on a mid-confirmation reload, where no pre-transaction observation exists; the
   * baseline then falls back to the first post-enable read, which is the old behaviour.
   */
  const preRunBalanceRef = useRef<bigint | null>(null);

  const hubChainId = getHubChainIdForEnvironment();
  const spokeClient = usePublicClient({ chainId: spokeChainId });

  // ── Derived state ─────────────────────────────────────────────────────────

  // The stopwatch belongs to a single run, and only ticks while enabled. A tag
  // mismatch means the stored value describes a superseded run, so it reads 0
  // immediately rather than one commit later.
  //
  // ACCEPTED EDGE CASE: disabling and re-enabling the SAME run (identical spokeHash+wallet)
  // replays the last stored reading until the next tick, up to ~1s, which could briefly
  // render 'timeout'. It is left alone deliberately. Clearing the value on disable means a
  // setState inside the disable effect (`react-hooks/set-state-in-effect`), and tagging the
  // reading with `startTimeRef` means reading a ref during render (`react-hooks/refs`) —
  // both were tried. The case is also not reachable through the UI: disabling closes the
  // mint flow, and reopening it produces a new spokeHash and therefore a new runKey, which
  // the tag below already zeroes.
  const elapsedTime = enabled && elapsedState.runKey === runKey ? elapsedState.ms : 0;

  // Likewise: a messageId extracted from a previous spoke receipt must never be
  // presented as the current run's message.
  const messageId = messageIdState?.runKey === runKey ? messageIdState.value : undefined;

  // Get contract addresses on hub
  let hubContractAddress: Address | undefined;
  try {
    hubContractAddress =
      mintType === 'wallet'
        ? getWalletSoulboundAddress(hubChainId)
        : getSupportSoulboundAddress(hubChainId);
  } catch {
    hubContractAddress = undefined;
  }

  // Extract messageId from spoke transaction receipt
  useEffect(() => {
    if (!enabled || !spokeHash || !spokeClient || messageId) return;

    // The receipt fetch is a network round trip. If spokeHash changes or the hook
    // unmounts while it is in flight, the resolved receipt belongs to a superseded run and
    // must not set messageId.
    let cancelled = false;

    const extractMessageId = async () => {
      try {
        const receipt = await spokeClient.getTransactionReceipt({ hash: spokeHash });
        if (cancelled) return;

        // Find MintRequestForwarded event
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: spokeSoulboundForwarderAbi,
              data: log.data,
              topics: log.topics,
            });

            if (decoded.eventName === 'MintRequestForwarded') {
              const msgId = (decoded.args as { messageId: Hex }).messageId;
              setMessageIdState({ runKey, value: msgId });
              logger.contract.info('Extracted Hyperlane messageId from receipt', {
                spokeHash,
                messageId: msgId,
              });
              return;
            }
          } catch {
            // Not the event we're looking for
          }
        }

        logger.contract.warn('MintRequestForwarded event not found in receipt', { spokeHash });
      } catch (err) {
        if (cancelled) return;
        logger.contract.error('Failed to extract messageId from receipt', {
          spokeHash,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void extractMessageId();

    return () => {
      cancelled = true;
    };
  }, [enabled, spokeHash, spokeClient, messageId, runKey]);

  // Calculate Hyperlane explorer URL
  const explorerUrl = useMemo(() => {
    if (!messageId) return undefined;
    try {
      return getBridgeMessageByIdUrl(messageId) ?? undefined;
    } catch {
      return undefined;
    }
  }, [messageId]);

  /**
   * Normalize a hub query result into "is the token minted".
   *
   * hasMinted returns a boolean directly; balanceOf has to be compared against
   * the balance observed when this run started, because a supporter may already
   * hold tokens from earlier donations.
   *
   * TRI-STATE, deliberately. The baseline is recorded by an effect (below), which runs after
   * the commit, so there is always at least one render where the balance is known and the
   * baseline is not. Treating that window as "baseline = 0n" is what told a repeat donor
   * "Success! Your support token has been minted on Base" the instant the SPOKE transaction
   * confirmed, before the hub mint had landed — any pre-existing balance read as a fresh
   * mint. The absence of a baseline means "unknown", not "zero", so it answers `false`:
   * polling simply continues for one more tick until the baseline exists.
   *
   * (The alternative — capturing the baseline during render — would keep the ref write and
   * the derivation in the same commit, but a ref mutated during render can leak from a render
   * React discards or replays. The tri-state fixes the same bug without touching render
   * purity.)
   */
  const deriveIsMinted = useCallback(
    (data: unknown): boolean => {
      if (data === undefined) return false;
      if (mintType === 'wallet') {
        return data as boolean;
      }
      // Baseline not yet recorded for THIS run: unknown, so not minted.
      if (!startingBalance || startingBalance.runKey !== runKey) return false;
      return (data as bigint) > startingBalance.value;
    },
    [mintType, runKey, startingBalance]
  );

  // Whether the clock says we are inside the polling window. Confirmation is
  // handled by the refetchInterval callback below, which can see the query's
  // own data and therefore does not need any state to break the ordering cycle.
  const withinPollingWindow =
    enabled && elapsedTime >= INITIAL_DELAY && elapsedTime < maxPollingTime;

  // Query hub chain for mint status
  // For wallet mints: use hasMinted(wallet) - one per wallet
  // For support mints: use balanceOf(wallet) > starting balance - multiple per wallet allowed
  const {
    data: mintQueryResult,
    refetch,
    isError: isQueryError,
  } = useReadContract({
    address: hubContractAddress,
    abi: mintType === 'wallet' ? walletSoulboundAbi : supportSoulboundAbi,
    functionName: mintType === 'wallet' ? 'hasMinted' : 'balanceOf',
    args: wallet ? [wallet] : undefined,
    chainId: hubChainId,
    query: {
      // Support mints read the hub while idle too, so `preRunBalanceRef` holds a genuine
      // pre-transaction balance by the time a mint starts. It is a single cached read with no
      // refetch interval outside the polling window, and it is what stops a fast bridge from
      // baselining away its own mint. Wallet mints need no baseline (`hasMinted` is absolute),
      // so they stay gated on `enabled`.
      enabled: (enabled || mintType === 'support') && !!wallet && !!hubContractAddress,
      refetchInterval: withinPollingWindow
        ? (query) => (deriveIsMinted(query.state.data) ? false : pollInterval)
        : false,
      staleTime: 1000,
    },
  });

  // Record starting balance for support mints (to detect new mints vs existing tokens).
  // Tagged with the run, so a new run re-baselines without needing a reset effect.
  //
  // Written only here, in an effect — never during render. Until this lands, `deriveIsMinted`
  // reports "not minted" for this run rather than comparing against an implied 0n; see the
  // tri-state note on `deriveIsMinted` for why that distinction is the actual fix.
  //
  // setState in an effect is deliberate here: capturing the FIRST reading of an external
  // system (the hub chain's balanceOf) is not derivable from any later render's inputs — the
  // baseline is by definition the value observed when this run began. Both alternatives are
  // worse: writing it during render is an impure ref mutation React may replay or discard,
  // and a plain ref cannot work at all because `deriveIsMinted` reads it during render, so
  // the write would not schedule the re-render that turns a new baseline into a new answer.
  // The run-tag guard makes this fire once per run, so it cannot loop.
  useEffect(() => {
    if (mintType !== 'support') return;
    if (mintQueryResult === undefined) return;

    // Not confirming anything yet: this reading is a "before" observation, which is exactly
    // what the baseline has to be. Recorded in a ref rather than state because nothing renders
    // from it until a run starts.
    if (!enabled) {
      preRunBalanceRef.current = mintQueryResult as bigint;
      return;
    }

    if (startingBalance?.runKey === runKey) return;
    // See the note above the effect: the first observed balance is external-system state,
    // not derivable from render inputs. Prefer the pre-transaction reading; fall back to the
    // first post-enable read only when there is none (mid-confirmation reload).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capturing external state
    setStartingBalance({
      runKey,
      value: preRunBalanceRef.current ?? (mintQueryResult as bigint),
    });
  }, [mintType, mintQueryResult, runKey, startingBalance, enabled]);

  const isMintedOnHub = useMemo(
    () => deriveIsMinted(mintQueryResult),
    [deriveIsMinted, mintQueryResult]
  );

  // Derive status.
  //
  // Terminal states are checked BEFORE 'extracting'. Message-ID extraction can fail
  // permanently — the MintRequestForwarded log may be absent from the receipt, or the
  // receipt fetch may fail — and messageId then stays undefined with no further effect runs
  // to change it. Checking 'extracting' first pinned the status there forever, hiding both a
  // mint that actually confirmed on the hub and the polling timeout. The messageId is only
  // ever used to render a bridge explorer link, so not having it must not mask the outcome.
  const status: SoulboundConfirmationStatus = useMemo(() => {
    if (!enabled) return 'idle';
    if (isMintedOnHub === true) return 'confirmed';
    if (elapsedTime >= maxPollingTime) return 'timeout';
    if (!messageId && spokeHash) return 'extracting';
    if (elapsedTime < INITIAL_DELAY) return 'waiting';
    return 'polling';
  }, [enabled, messageId, spokeHash, isMintedOnHub, elapsedTime, maxPollingTime]);

  // Start elapsed time tracking
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // No state clearing needed: `elapsedTime` already derives 0 while disabled, so this
      // effect stays free of setState. Nulling the ref stops any in-flight tick from
      // writing a reading for a stopwatch that is no longer running.
      startTimeRef.current = null;
      return;
    }

    const startedAt = Date.now();
    startTimeRef.current = startedAt;

    logger.contract.info('Starting cross-chain soulbound confirmation polling', {
      mintType,
      wallet,
      spokeHash,
      hubChainId,
    });

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current === startedAt) {
        setElapsedState({ runKey, ms: Date.now() - startedAt });
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
    };
  }, [enabled, mintType, wallet, spokeHash, hubChainId, runKey]);

  // Log terminal states once per run and stop the stopwatch.
  useEffect(() => {
    const stopStopwatch = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (status === 'confirmed' && loggedConfirmationForRunRef.current !== runKey) {
      loggedConfirmationForRunRef.current = runKey;
      stopStopwatch();
      logger.contract.info('Cross-chain soulbound mint confirmed!', {
        mintType,
        wallet,
        messageId,
        elapsedTime,
      });
    }
    if (status === 'timeout' && loggedTimeoutForRunRef.current !== runKey) {
      loggedTimeoutForRunRef.current = runKey;
      stopStopwatch();
      logger.contract.warn('Cross-chain soulbound confirmation timeout', {
        mintType,
        wallet,
        elapsedTime,
      });
    }
  }, [status, runKey, mintType, wallet, messageId, elapsedTime]);

  // Log query errors
  useEffect(() => {
    if (status === 'polling' && isQueryError) {
      logger.contract.error('Cross-chain soulbound confirmation query error', {
        mintType,
        wallet,
        hubChainId,
      });
    }
  }, [status, isQueryError, mintType, wallet, hubChainId]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsedState({ runKey, ms: 0 });
    setMessageIdState(null);
    loggedConfirmationForRunRef.current = null;
    loggedTimeoutForRunRef.current = null;
    setStartingBalance(null);
  }, [runKey]);

  return {
    status,
    messageId,
    explorerUrl,
    isMintedOnHub,
    elapsedTime,
    refresh,
    reset,
  };
}
