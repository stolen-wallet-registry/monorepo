/**
 * Countdown timer hook for grace period tracking.
 *
 * Calculates time remaining based on target block and chain block time,
 * then counts down in real-time.
 *
 * DESIGN NOTE — what is state and what is derived
 * ------------------------------------------------
 * Only three things are genuinely stateful here:
 *
 *   - `estimate`         the ticking display value, tagged with the deadline it
 *                        was computed for
 *   - `isPaused`         an explicit user action (pause()/start())
 *   - `waitingForTarget` a latch recording that the estimate hit zero
 *
 * Everything else is computed during render:
 *
 *   - `totalMs`    the tagged estimate, or a fresh calculation if the tag is
 *                  stale (see the note on `estimate` below).
 *   - `isExpired`  comes from real chain data (currentBlock >= targetBlock).
 *                  It is NEVER decided by the countdown estimate — a chain
 *                  producing blocks slower than expected must not let the UI
 *                  advance the user past the grace period before the contract
 *                  actually permits it.
 *   - `isRunning`  is just "not paused, time left, not expired".
 *   - `isWaitingForBlock` is "we latched for THIS target, and it hasn't
 *                  arrived yet". Comparing the latch against the current
 *                  `targetBlock` means a new deadline clears it for free.
 *
 * Deriving these removes the effects that previously wrote them, which is why
 * there is no "reset everything when targetBlock changes" effect any more: a
 * new deadline invalidates the derived values automatically.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  estimateTimeFromBlocks,
  formatTimeRemaining,
  blocksRemaining,
  type TimeRemaining,
} from '@/lib/blocks';
import { logger } from '@/lib/logger';

export interface UseCountdownTimerOptions {
  /** Target block number when the countdown ends */
  targetBlock: bigint | null;
  /** Current block number */
  currentBlock: bigint | null;
  /** Chain ID for block time estimation */
  chainId: number;
  /** Callback when timer expires */
  onExpire?: () => void;
  /** Auto-start the timer (default: true) */
  autoStart?: boolean;
}

export interface UseCountdownTimerResult {
  /** Time breakdown */
  timeRemaining: TimeRemaining;
  /** Total milliseconds remaining */
  totalMs: number;
  /** Estimated blocks remaining */
  blocksLeft: bigint;
  /** Whether the countdown has expired (verified by actual block) */
  isExpired: boolean;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Whether waiting for block confirmation after timer estimate hit 0 */
  isWaitingForBlock: boolean;
  /** Start the timer */
  start: () => void;
  /** Pause the timer */
  pause: () => void;
  /** Reset to initial calculated time */
  reset: () => void;
}

/**
 * Countdown timer that estimates time from block difference.
 *
 * @param options - Timer configuration
 * @returns Timer state and controls
 */
export function useCountdownTimer(options: UseCountdownTimerOptions): UseCountdownTimerResult {
  const { targetBlock, currentBlock, chainId, onExpire, autoStart = true } = options;

  // Whether we have real chain data to work from at all. Missing data is not
  // expiry — the countdown simply has nothing to show yet.
  const hasBlockData =
    targetBlock !== null && targetBlock !== 0n && currentBlock !== null && currentBlock !== 0n;

  // Calculate initial values
  const calculateInitialMs = useCallback((): number => {
    if (!hasBlockData) return 0;
    const blocks = blocksRemaining(currentBlock, targetBlock);
    if (blocks <= 0n) return 0;
    return estimateTimeFromBlocks(blocks, chainId);
  }, [hasBlockData, targetBlock, currentBlock, chainId]);

  /**
   * The ticking estimate, tagged with the deadline it was computed for.
   *
   * The tag matters: when `targetBlock` changes, the stored `ms` belongs to the
   * previous deadline and is stale for exactly one commit (until the re-sync
   * effect below runs). Reading it unconditionally let a just-expired `ms: 0`
   * leak into the new deadline's first render, which latched
   * `isWaitingForBlock` against a countdown that had not actually run out.
   * Falling back to a fresh calculation when the tag doesn't match removes that
   * window entirely rather than relying on effect ordering.
   */
  const [estimate, setEstimate] = useState<{ target: bigint | null; ms: number }>(() => ({
    target: targetBlock,
    ms: calculateInitialMs(),
  }));
  const [isPaused, setIsPaused] = useState<boolean>(() => !autoStart);
  // The targetBlock for which the display estimate reached zero. Null means the
  // estimate has not run out for the current deadline.
  const [waitingForTarget, setWaitingForTarget] = useState<bigint | null>(null);

  // ── Derived values ────────────────────────────────────────────────────────

  const totalMs = estimate.target === targetBlock ? estimate.ms : calculateInitialMs();

  /**
   * Expiry is decided by the chain, not by the countdown. This is the security
   * boundary: the estimate above is advisory, this is authoritative.
   */
  const isExpired = hasBlockData && currentBlock >= targetBlock;

  /**
   * Sticky until either the block arrives (isExpired) or a new deadline is
   * issued (targetBlock no longer matches the latch). Deliberately NOT
   * `totalMs === 0`: currentBlock keeps polling and re-syncs totalMs to a
   * non-zero estimate, and the UI must stay on "waiting for block" rather than
   * flicking back to a running countdown.
   */
  const isWaitingForBlock =
    !isExpired && waitingForTarget !== null && waitingForTarget === targetBlock;

  /**
   * The latch is part of this, not just of `isWaitingForBlock`. Without it the
   * re-sync effect's next non-zero estimate flips `isRunning` back to true and
   * the display resumes counting down after it had already hit zero — the exact
   * behaviour the latch above exists to prevent. (Consumers were shielded only
   * because `getGracePeriodStatus` happens to test `isWaitingForBlock` first.)
   */
  const isRunning = !isPaused && totalMs > 0 && !isExpired && !isWaitingForBlock;

  // ── Effects ───────────────────────────────────────────────────────────────

  // Assigned in an effect, not during render: writing a ref while rendering is a side
  // effect, and a render that React discards would otherwise leave this pointing at a
  // callback from a render that never committed. No dependency array — callers pass an
  // inline function, so listing it would just make the dependency churn every render.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  // The deadline for which onExpire has already fired, so a second flow with a
  // fresh targetBlock re-arms it without needing a reset effect.
  const firedForTargetRef = useRef<bigint | null>(null);

  // Re-sync the display estimate whenever the chain data moves.
  useEffect(() => {
    // Nothing left to count down once the block target is confirmed reached.
    if (isExpired) return;

    if (!hasBlockData) {
      logger.registration.debug('Countdown timer waiting for block data', {
        targetBlock: targetBlock?.toString() ?? 'null',
        currentBlock: currentBlock?.toString() ?? 'null',
      });
      return;
    }

    const newMs = calculateInitialMs();

    logger.registration.debug('Countdown timer calculation', {
      targetBlock: targetBlock.toString(),
      currentBlock: currentBlock.toString(),
      blocksRemaining: blocksRemaining(currentBlock, targetBlock).toString(),
      calculatedMs: newMs,
      chainId,
    });

    setEstimate({ target: targetBlock, ms: newMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chainId is captured within calculateInitialMs
  }, [calculateInitialMs, targetBlock, currentBlock, hasBlockData, isExpired]);

  // Countdown interval - only manages display time, NOT expiration
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      // Pure updater: decrement only. State updaters may run more than once per
      // update (StrictMode, discarded concurrent renders), so setting other
      // state or logging from inside one duplicates work. The tag check keeps a
      // tick that lands between a deadline change and the re-sync effect from
      // decrementing the previous deadline's estimate.
      setEstimate((prev) =>
        prev.target === targetBlock ? { ...prev, ms: Math.max(0, prev.ms - 1000) } : prev
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, targetBlock]);

  // Latch "the estimate ran out" for the current deadline. Reaching zero does
  // NOT mean expiry — it only switches the UI into "waiting for block".
  // This records history rather than deriving a value; see the note at the
  // setWaitingForTarget call below for why it cannot be computed during render.
  // react-doctor-disable-next-line react-doctor/no-derived-state-effect
  useEffect(() => {
    if (isPaused || isExpired || !hasBlockData || totalMs > 0) return;
    if (waitingForTarget === targetBlock) return;

    logger.registration.info('Timer estimate reached 0, waiting for block confirmation');
    // This is a latch, not derived state: it records that the estimate *did*
    // reach zero for this deadline. It cannot be computed from current values,
    // because the re-sync effect above raises `totalMs` back above zero on the
    // next poll (blocks genuinely remain; the chain was just slower than the
    // assumed block time). Deriving it as `totalMs === 0` would flick the UI out
    // of "waiting for block" and back into a running countdown on every poll.
    // react-doctor-disable-next-line react-doctor/no-derived-state
    setWaitingForTarget(targetBlock);
  }, [isPaused, isExpired, hasBlockData, totalMs, waitingForTarget, targetBlock]);

  // Fire onExpire once per deadline
  useEffect(() => {
    if (!isExpired) return;
    if (firedForTargetRef.current === targetBlock) return;

    logger.registration.info('Block target reached, setting expired', {
      targetBlock: targetBlock?.toString() ?? 'null',
      currentBlock: currentBlock?.toString() ?? 'null',
    });
    firedForTargetRef.current = targetBlock;
    onExpireRef.current?.();
  }, [isExpired, targetBlock, currentBlock]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const reset = useCallback(() => {
    setEstimate({ target: targetBlock, ms: calculateInitialMs() });
    setIsPaused(!autoStart);
    setWaitingForTarget(null);
    firedForTargetRef.current = null;
  }, [calculateInitialMs, autoStart, targetBlock]);

  const blocksLeft = useMemo(
    () => (hasBlockData ? blocksRemaining(currentBlock, targetBlock) : 0n),
    [hasBlockData, currentBlock, targetBlock]
  );

  return {
    timeRemaining: formatTimeRemaining(totalMs),
    totalMs,
    blocksLeft,
    isExpired,
    isRunning,
    isWaitingForBlock,
    start,
    pause,
    reset,
  };
}
