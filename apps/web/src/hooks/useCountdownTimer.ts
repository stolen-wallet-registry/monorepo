/**
 * Countdown timer hook for grace period tracking.
 *
 * Calculates time remaining based on target block and chain block time,
 * then counts down in real-time.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  estimateTimeFromBlocks,
  formatTimeRemaining,
  blocksRemaining,
  type TimeRemaining,
} from '@/lib/blocks';

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
  /** Whether the countdown has expired */
  isExpired: boolean;
  /** Whether the timer is currently running */
  isRunning: boolean;
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

  // Calculate initial values
  const calculateInitialMs = useCallback((): number => {
    if (!targetBlock || !currentBlock) return 0;
    const blocks = blocksRemaining(currentBlock, targetBlock);
    if (blocks <= 0n) return 0;
    return estimateTimeFromBlocks(blocks, chainId);
  }, [targetBlock, currentBlock, chainId]);

  const calculateBlocksLeft = useCallback((): bigint => {
    if (!targetBlock || !currentBlock) return 0n;
    return blocksRemaining(currentBlock, targetBlock);
  }, [targetBlock, currentBlock]);

  const [totalMs, setTotalMs] = useState<number>(() => calculateInitialMs());
  const [isRunning, setIsRunning] = useState<boolean>(autoStart && calculateInitialMs() > 0);
  const [hasExpired, setHasExpired] = useState<boolean>(false);

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const expiredCallbackFired = useRef(false);

  // Reset when target/current block changes
  useEffect(() => {
    const newMs = calculateInitialMs();
    setTotalMs(newMs);
    setHasExpired(newMs <= 0);
    expiredCallbackFired.current = false;

    if (autoStart && newMs > 0) {
      setIsRunning(true);
    }
  }, [calculateInitialMs, autoStart]);

  // Countdown interval
  useEffect(() => {
    if (!isRunning || totalMs <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setTotalMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          setIsRunning(false);
          setHasExpired(true);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, totalMs]);

  // Fire onExpire callback once
  useEffect(() => {
    if (hasExpired && !expiredCallbackFired.current) {
      expiredCallbackFired.current = true;
      onExpireRef.current?.();
    }
  }, [hasExpired]);

  const start = useCallback(() => {
    if (totalMs > 0) {
      setIsRunning(true);
    }
  }, [totalMs]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    const newMs = calculateInitialMs();
    setTotalMs(newMs);
    setHasExpired(newMs <= 0);
    expiredCallbackFired.current = false;
    if (autoStart && newMs > 0) {
      setIsRunning(true);
    }
  }, [calculateInitialMs, autoStart]);

  return {
    timeRemaining: formatTimeRemaining(totalMs),
    totalMs,
    blocksLeft: calculateBlocksLeft(),
    isExpired: hasExpired,
    isRunning,
    start,
    pause,
    reset,
  };
}
