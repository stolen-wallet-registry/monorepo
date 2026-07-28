/**
 * Tests for useCountdownTimer.
 *
 * This hook drives the anti-phishing grace period, so its behaviour is
 * security-relevant: the countdown shown to the user is only an *estimate*
 * derived from block times, while actual expiry must come from real chain data
 * (currentBlock >= targetBlock). These tests pin that separation down so a
 * later refactor can't quietly let the estimate decide expiry.
 *
 * Base (chain 8453) is used throughout: 2s per block, so N blocks == N * 2000ms.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdownTimer } from './useCountdownTimer';

const BASE = 8453;
const BLOCK_MS = 2000;

/** Advance fake timers inside act() so React flushes the resulting state updates. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useCountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial calculation', () => {
    it('derives totalMs from the block delta and the chain block time', () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 110n, currentBlock: 100n, chainId: BASE })
      );

      expect(result.current.totalMs).toBe(10 * BLOCK_MS);
      expect(result.current.blocksLeft).toBe(10n);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isRunning).toBe(true);
    });

    it('reports zero and does not auto-start when block data is missing', () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: null, currentBlock: null, chainId: BASE })
      );

      expect(result.current.totalMs).toBe(0);
      expect(result.current.blocksLeft).toBe(0n);
      expect(result.current.isRunning).toBe(false);
      // Missing data is not expiry — the countdown simply has nothing to show yet.
      expect(result.current.isExpired).toBe(false);
    });

    it('does not auto-start when autoStart is false', () => {
      const { result } = renderHook(() =>
        useCountdownTimer({
          targetBlock: 110n,
          currentBlock: 100n,
          chainId: BASE,
          autoStart: false,
        })
      );

      expect(result.current.totalMs).toBe(10 * BLOCK_MS);
      expect(result.current.isRunning).toBe(false);
    });

    it('expires immediately when the target block has already been reached', () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 100n, currentBlock: 100n, chainId: BASE })
      );

      expect(result.current.totalMs).toBe(0);
      expect(result.current.isExpired).toBe(true);
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('ticking', () => {
    it('decrements by 1000ms per second while running', async () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 105n, currentBlock: 100n, chainId: BASE })
      );

      expect(result.current.totalMs).toBe(10_000);

      await advance(3000);

      expect(result.current.totalMs).toBe(7000);
    });

    it('does not tick below zero', async () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 101n, currentBlock: 100n, chainId: BASE })
      );

      await advance(10_000);

      expect(result.current.totalMs).toBe(0);
    });

    it('stops ticking while paused and resumes on start', async () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 110n, currentBlock: 100n, chainId: BASE })
      );

      act(() => result.current.pause());
      await advance(5000);

      expect(result.current.totalMs).toBe(20_000);
      expect(result.current.isRunning).toBe(false);

      act(() => result.current.start());
      await advance(2000);

      expect(result.current.totalMs).toBe(18_000);
    });
  });

  describe('estimate vs. chain-verified expiry (security-critical)', () => {
    // The countdown is only an estimate. If it were allowed to decide expiry, a
    // chain producing blocks slower than expected would let the UI advance the
    // user past the grace period before the contract actually permits it.
    it('does not expire when the estimate reaches zero but the block has not arrived', async () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 102n, currentBlock: 100n, chainId: BASE })
      );

      await advance(10_000);

      expect(result.current.totalMs).toBe(0);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isWaitingForBlock).toBe(true);
      expect(result.current.isRunning).toBe(false);
    });

    it('expires once currentBlock reaches targetBlock', async () => {
      const { result, rerender } = renderHook(
        ({ currentBlock }) => useCountdownTimer({ targetBlock: 102n, currentBlock, chainId: BASE }),
        { initialProps: { currentBlock: 100n } }
      );

      await advance(10_000);
      expect(result.current.isExpired).toBe(false);

      await act(async () => {
        rerender({ currentBlock: 102n });
      });

      expect(result.current.isExpired).toBe(true);
      expect(result.current.isWaitingForBlock).toBe(false);
    });

    it('stays in the waiting state across several polls that do not reach the target', async () => {
      const { result, rerender } = renderHook(
        ({ currentBlock }) => useCountdownTimer({ targetBlock: 105n, currentBlock, chainId: BASE }),
        { initialProps: { currentBlock: 100n } }
      );

      await advance(10_000);

      for (const block of [101n, 102n, 103n, 104n]) {
        await act(async () => {
          rerender({ currentBlock: block });
        });
        expect(result.current.isExpired).toBe(false);
        expect(result.current.isWaitingForBlock).toBe(true);
      }

      await act(async () => {
        rerender({ currentBlock: 105n });
      });
      expect(result.current.isExpired).toBe(true);
    });
  });

  describe('onExpire', () => {
    it('fires exactly once', async () => {
      const onExpire = vi.fn();
      const { result, rerender } = renderHook(
        ({ currentBlock }) =>
          useCountdownTimer({ targetBlock: 102n, currentBlock, chainId: BASE, onExpire }),
        { initialProps: { currentBlock: 100n } }
      );

      await advance(10_000);
      expect(onExpire).not.toHaveBeenCalled();

      await act(async () => {
        rerender({ currentBlock: 102n });
      });
      expect(onExpire).toHaveBeenCalledTimes(1);

      // Further polls past the target must not re-fire it.
      await act(async () => {
        rerender({ currentBlock: 103n });
      });
      await act(async () => {
        rerender({ currentBlock: 104n });
      });

      expect(result.current.isExpired).toBe(true);
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('fires immediately when the target block was already reached on mount', async () => {
      const onExpire = vi.fn();
      renderHook(() =>
        useCountdownTimer({ targetBlock: 100n, currentBlock: 100n, chainId: BASE, onExpire })
      );

      await advance(0);

      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('calls the latest callback, not the one captured on mount', async () => {
      const first = vi.fn();
      const second = vi.fn();

      const { rerender } = renderHook(
        ({ currentBlock, onExpire }) =>
          useCountdownTimer({ targetBlock: 102n, currentBlock, chainId: BASE, onExpire }),
        { initialProps: { currentBlock: 100n, onExpire: first } }
      );

      await act(async () => {
        rerender({ currentBlock: 100n, onExpire: second });
      });
      await advance(10_000);
      await act(async () => {
        rerender({ currentBlock: 102n, onExpire: second });
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe('new deadlines', () => {
    // A user can start a second registration flow with the same wallet. The
    // contract issues fresh deadlines, and the previous expiry is stale — if it
    // survived, the new grace period would render as already complete.
    it('clears expiry when targetBlock changes to a new value', async () => {
      const { result, rerender } = renderHook(
        ({ targetBlock, currentBlock }) =>
          useCountdownTimer({ targetBlock, currentBlock, chainId: BASE }),
        { initialProps: { targetBlock: 102n, currentBlock: 100n } }
      );

      await advance(10_000);
      await act(async () => {
        rerender({ targetBlock: 102n, currentBlock: 102n });
      });
      expect(result.current.isExpired).toBe(true);

      // Second flow: new deadline, further ahead of the current block.
      await act(async () => {
        rerender({ targetBlock: 112n, currentBlock: 102n });
      });

      expect(result.current.isExpired).toBe(false);
      expect(result.current.isWaitingForBlock).toBe(false);
      expect(result.current.totalMs).toBe(10 * BLOCK_MS);
      expect(result.current.isRunning).toBe(true);
    });

    it('re-arms onExpire for the new deadline', async () => {
      const onExpire = vi.fn();
      const { rerender } = renderHook(
        ({ targetBlock, currentBlock }) =>
          useCountdownTimer({ targetBlock, currentBlock, chainId: BASE, onExpire }),
        { initialProps: { targetBlock: 102n, currentBlock: 102n } }
      );

      await advance(0);
      expect(onExpire).toHaveBeenCalledTimes(1);

      await act(async () => {
        rerender({ targetBlock: 112n, currentBlock: 102n });
      });
      await advance(20_000);
      await act(async () => {
        rerender({ targetBlock: 112n, currentBlock: 112n });
      });

      expect(onExpire).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('recomputes from the current block data and restarts', async () => {
      const { result } = renderHook(() =>
        useCountdownTimer({ targetBlock: 110n, currentBlock: 100n, chainId: BASE })
      );

      await advance(5000);
      expect(result.current.totalMs).toBe(15_000);

      act(() => result.current.reset());

      expect(result.current.totalMs).toBe(20_000);
      expect(result.current.isRunning).toBe(true);
      expect(result.current.isExpired).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('stops its interval on unmount', async () => {
      const { unmount } = renderHook(() =>
        useCountdownTimer({ targetBlock: 110n, currentBlock: 100n, chainId: BASE })
      );

      unmount();

      // No pending timers means no setState-after-unmount from the interval.
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
