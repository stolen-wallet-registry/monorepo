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

  // Calculate initial values
  const calculateInitialMs = useCallback((): number => {
    if (!targetBlock || !currentBlock) return 0;
    const blocks = blocksRemaining(currentBlock, targetBlock);
    if (blocks <= 0n) return 0;
    return estimateTimeFromBlocks(blocks, chainId);
  }, [targetBlock, currentBlock, chainId]);

  const calculateBlocksLeft = useCallback((): bigint => {
    if (!targetBlock || !currentBlock) return 0n;
    // blocksRemaining already returns 0n when targetBlock <= currentBlock
    return blocksRemaining(currentBlock, targetBlock);
  }, [targetBlock, currentBlock]);

  const [totalMs, setTotalMs] = useState<number>(() => calculateInitialMs());
  const [isRunning, setIsRunning] = useState<boolean>(() => {
    const initialMs = calculateInitialMs();
    return autoStart && initialMs > 0;
  });
  const [hasExpired, setHasExpired] = useState<boolean>(false);
  const [isWaitingForBlock, setIsWaitingForBlock] = useState<boolean>(false);

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const expiredCallbackFired = useRef(false);

  // Check if actual block target has been reached
  const isBlockTargetReached = useCallback((): boolean => {
    if (targetBlock === null || currentBlock === null) return false;
    return currentBlock >= targetBlock;
  }, [targetBlock, currentBlock]);

  // Reset when target/current block changes
  useEffect(() => {
    // Don't process if we don't have valid block data yet
    if (targetBlock === null || currentBlock === null) {
      logger.registration.debug('Countdown timer waiting for block data', {
        targetBlock: targetBlock?.toString() ?? 'null',
        currentBlock: currentBlock?.toString() ?? 'null',
      });
      return;
    }

    const newMs = calculateInitialMs();
    const blocks = blocksRemaining(currentBlock, targetBlock);

    logger.registration.debug('Countdown timer calculation', {
      targetBlock: targetBlock.toString(),
      currentBlock: currentBlock.toString(),
      blocksRemaining: blocks.toString(),
      calculatedMs: newMs,
      willExpireImmediately: newMs <= 0,
      chainId,
    });

    setTotalMs(newMs);
    setHasExpired(newMs <= 0);
    expiredCallbackFired.current = false;

    if (newMs <= 0) {
      logger.registration.debug('Block target reached, timer complete', {
        targetBlock: targetBlock.toString(),
        currentBlock: currentBlock.toString(),
      });
      // Normalize isRunning to false when instant-expired
      setIsRunning(false);
    } else if (autoStart) {
      setIsRunning(true);
    }
  }, [calculateInitialMs, autoStart, targetBlock, currentBlock, chainId]);

  // Countdown interval - only manages display time, NOT expiration
  useEffect(() => {
    if (!isRunning || totalMs <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setTotalMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          // Timer estimate hit 0, but DON'T set hasExpired yet
          // Instead, wait for actual block confirmation
          setIsRunning(false);
          setIsWaitingForBlock(true);
          logger.registration.info('Timer estimate reached 0, waiting for block confirmation', {
            targetBlock: targetBlock?.toString() ?? 'null',
            currentBlock: currentBlock?.toString() ?? 'null',
          });
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, totalMs, targetBlock, currentBlock]);

  // Block verification effect - determines actual expiration from chain data
  // This runs whenever currentBlock updates from contract polling
  useEffect(() => {
    // Only verify when we're waiting for block confirmation OR timer hit 0
    if (!isWaitingForBlock && totalMs > 0) {
      return;
    }

    const blockReached = isBlockTargetReached();

    if (blockReached && !hasExpired) {
      logger.registration.info('Block target reached, setting expired', {
        targetBlock: targetBlock?.toString() ?? 'null',
        currentBlock: currentBlock?.toString() ?? 'null',
      });
      setIsWaitingForBlock(false);
      setHasExpired(true);
    } else if (isWaitingForBlock && !blockReached) {
      // Timer estimate hit 0 but blocks haven't caught up - resync
      const newMs = calculateInitialMs();
      if (newMs > 0) {
        logger.registration.info('Resyncing timer - blocks behind estimate', {
          newMs,
          targetBlock: targetBlock?.toString() ?? 'null',
          currentBlock: currentBlock?.toString() ?? 'null',
        });
        setTotalMs(newMs);
        setIsWaitingForBlock(false);
        setIsRunning(true);
      }
    }
  }, [
    currentBlock,
    targetBlock,
    isWaitingForBlock,
    totalMs,
    hasExpired,
    isBlockTargetReached,
    calculateInitialMs,
  ]);

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

    if (newMs <= 0) {
      // Normalize isRunning to false when instant-expired
      setIsRunning(false);
    } else if (autoStart) {
      setIsRunning(true);
    }
  }, [calculateInitialMs, autoStart]);

  return {
    timeRemaining: formatTimeRemaining(totalMs),
    totalMs,
    blocksLeft: calculateBlocksLeft(),
    isExpired: hasExpired,
    isRunning,
    isWaitingForBlock,
    start,
    pause,
    reset,
  };
}
