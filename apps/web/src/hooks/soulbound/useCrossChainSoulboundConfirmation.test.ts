/**
 * Tests for useCrossChainSoulboundConfirmation.
 *
 * This hook is the cross-chain confirmation path: after a spoke-chain mint tx
 * lands, it polls the hub chain until the soulbound token shows up (or gives
 * up). Its behaviour is timing-sensitive and its outputs gate UI that tells a
 * user "your token was minted", so these tests pin down:
 *
 *   - the status machine (idle → extracting → waiting → polling → confirmed/timeout)
 *   - WHEN polling is scheduled, and when it stops
 *   - what happens when a *new* run starts (new spokeHash / wallet) while state
 *     from the previous run is still in the hook
 *
 * wagmi is mocked so `useReadContract`'s result and the options it was called
 * with are both directly controllable — that lets us assert polling scheduling
 * without a real query client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

const h = vi.hoisted(() => ({
  /** Value returned as `data` from useReadContract. */
  readData: undefined as unknown,
  readIsError: false,
  /** Last options object useReadContract was called with. */
  readOptions: undefined as unknown,
  refetch: vi.fn(),
  /** Receipt returned by publicClient.getTransactionReceipt. */
  receiptLogs: [] as unknown[],
  receiptError: null as Error | null,
  /** Controls how a log decodes. Return null to simulate "not our event". */
  decode: (() => null) as (log: unknown) => unknown,
  getTransactionReceipt: vi.fn(),
}));

vi.mock('wagmi', () => ({
  usePublicClient: () => ({ getTransactionReceipt: h.getTransactionReceipt }),
  useReadContract: (options: unknown) => {
    h.readOptions = options;
    return { data: h.readData, refetch: h.refetch, isError: h.readIsError };
  },
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('viem');
  return {
    ...actual,
    decodeEventLog: (args: { data: unknown; topics: unknown }) => {
      const decoded = h.decode(args);
      if (decoded === null) throw new Error('not this event');
      return decoded;
    },
  };
});

vi.mock('@swr/chains', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@swr/chains');
  return {
    ...actual,
    getWalletSoulboundAddress: () => '0x1111111111111111111111111111111111111111',
    getSupportSoulboundAddress: () => '0x2222222222222222222222222222222222222222',
    getBridgeMessageByIdUrl: (id: string) => `https://explorer.test/message/${id}`,
  };
});

vi.mock('@/lib/chains/config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/chains/config');
  return { ...actual, getHubChainIdForEnvironment: () => 84532 };
});

import { useCrossChainSoulboundConfirmation } from './useCrossChainSoulboundConfirmation';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const SPOKE_HASH = ('0x' + 'ab'.repeat(32)) as Hash;
const SPOKE_HASH_2 = ('0x' + 'cd'.repeat(32)) as Hash;
const MESSAGE_ID = ('0x' + '11'.repeat(32)) as Hex;
const MESSAGE_ID_2 = ('0x' + '22'.repeat(32)) as Hex;

const INITIAL_DELAY = 2000;
const POLL_INTERVAL = 1000;
const MAX_POLLING_TIME = 10_000;

/** Advance fake timers inside act() so React flushes resulting state updates. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Flush pending microtasks (receipt promise, queueMicrotask) inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function queryOptions() {
  return (h.readOptions as { query: Record<string, unknown> }).query;
}

/**
 * What TanStack Query would actually use as the refetch interval, given the
 * current data. Written to tolerate either a literal or a function form so the
 * assertion describes polling *behaviour* rather than one particular encoding.
 */
function effectiveRefetchInterval(): number | false | undefined {
  const ri = queryOptions().refetchInterval;
  if (typeof ri === 'function') {
    return (ri as (q: unknown) => number | false | undefined)({ state: { data: h.readData } });
  }
  return ri as number | false | undefined;
}

/** True when the hub query is both enabled and on a repeating schedule. */
function isPolling(): boolean {
  const interval = effectiveRefetchInterval();
  return queryOptions().enabled === true && typeof interval === 'number' && interval > 0;
}

interface Props {
  spokeHash: Hash | undefined;
  wallet: Address | undefined;
  enabled: boolean;
  mintType: 'wallet' | 'support';
}

function render(overrides: Partial<Props> = {}) {
  const initialProps: Props = {
    spokeHash: SPOKE_HASH,
    wallet: WALLET,
    enabled: true,
    mintType: 'wallet',
    ...overrides,
  };
  return renderHook(
    (props: Props) =>
      useCrossChainSoulboundConfirmation({
        spokeHash: props.spokeHash,
        spokeChainId: 11155420,
        mintType: props.mintType,
        wallet: props.wallet,
        enabled: props.enabled,
        pollInterval: POLL_INTERVAL,
        maxPollingTime: MAX_POLLING_TIME,
      }),
    { initialProps }
  );
}

describe('useCrossChainSoulboundConfirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.readData = undefined;
    h.readIsError = false;
    h.readOptions = undefined;
    h.refetch = vi.fn();
    h.receiptError = null;
    h.receiptLogs = [{ data: '0x', topics: [] }];
    // Default: every log decodes to the messageId-bearing event.
    h.decode = () => ({ eventName: 'MintRequestForwarded', args: { messageId: MESSAGE_ID } });
    h.getTransactionReceipt = vi.fn(async () => {
      if (h.receiptError) throw h.receiptError;
      return { logs: h.receiptLogs };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('idle', () => {
    it('is idle and does not read the receipt when disabled', async () => {
      const { result } = render({ enabled: false });
      await flush();

      expect(result.current.status).toBe('idle');
      expect(result.current.messageId).toBeUndefined();
      expect(result.current.elapsedTime).toBe(0);
      expect(h.getTransactionReceipt).not.toHaveBeenCalled();
      expect(isPolling()).toBe(false);
    });

    it('returns to idle and zeroes elapsed time when disabled mid-run', async () => {
      const { result, rerender } = render();
      await flush();
      await advance(3000);
      expect(result.current.elapsedTime).toBeGreaterThan(0);

      rerender({
        spokeHash: SPOKE_HASH,
        wallet: WALLET,
        enabled: false,
        mintType: 'wallet',
      });
      await flush();

      expect(result.current.status).toBe('idle');
      expect(result.current.elapsedTime).toBe(0);
    });
  });

  describe('messageId extraction', () => {
    it('starts in extracting and resolves the messageId from the receipt logs', async () => {
      const { result } = render();

      expect(result.current.status).toBe('extracting');
      expect(result.current.messageId).toBeUndefined();

      await flush();

      expect(h.getTransactionReceipt).toHaveBeenCalledWith({ hash: SPOKE_HASH });
      expect(result.current.messageId).toBe(MESSAGE_ID);
      expect(result.current.explorerUrl).toBe(`https://explorer.test/message/${MESSAGE_ID}`);
      expect(result.current.status).toBe('waiting');
    });

    it('stays in extracting when the receipt has no MintRequestForwarded event', async () => {
      h.decode = () => null;
      const { result } = render();
      await flush();
      await advance(3000);

      expect(result.current.messageId).toBeUndefined();
      expect(result.current.explorerUrl).toBeUndefined();
      // Elapsed time keeps running, but status is pinned to extracting while
      // there is a spokeHash and no messageId.
      expect(result.current.status).toBe('extracting');
    });

    it('stays in extracting when the receipt fetch throws', async () => {
      h.receiptError = new Error('rpc down');
      const { result } = render();
      await flush();

      expect(result.current.messageId).toBeUndefined();
      expect(result.current.status).toBe('extracting');
    });

    it('does not apply a receipt that resolves after spokeHash moved on', async () => {
      // The receipt fetch is a network round trip. A result belonging to a
      // superseded run must never become the current messageId.
      let release: ((v: { logs: unknown[] }) => void) | undefined;
      let call = 0;
      h.getTransactionReceipt = vi.fn(() => {
        call += 1;
        // Only the first (superseded) run's receipt ever resolves.
        if (call > 1) return new Promise<never>(() => {});
        return new Promise<{ logs: unknown[] }>((resolve) => {
          release = resolve;
        });
      });

      const { result, rerender } = render();

      rerender({ spokeHash: SPOKE_HASH_2, wallet: WALLET, enabled: true, mintType: 'wallet' });
      await act(async () => {
        release?.({ logs: [{ data: '0x', topics: [] }] });
        await Promise.resolve();
      });

      expect(result.current.messageId).not.toBe(MESSAGE_ID);
    });
  });

  describe('elapsed time and status transitions', () => {
    it('waits for the initial delay before polling, then polls', async () => {
      const { result } = render();
      await flush();

      expect(result.current.elapsedTime).toBe(0);
      expect(result.current.status).toBe('waiting');
      expect(isPolling()).toBe(false);

      await advance(1000);
      expect(result.current.elapsedTime).toBe(1000);
      expect(result.current.status).toBe('waiting');
      expect(isPolling()).toBe(false);

      await advance(1000);
      expect(result.current.elapsedTime).toBe(INITIAL_DELAY);
      expect(result.current.status).toBe('polling');
      expect(isPolling()).toBe(true);
      expect(effectiveRefetchInterval()).toBe(POLL_INTERVAL);
    });

    it('ticks elapsed time once per second', async () => {
      const { result } = render();
      await flush();

      await advance(5000);
      expect(result.current.elapsedTime).toBe(5000);
    });
  });

  describe('confirmation', () => {
    it('reports confirmed once the hub says the wallet has minted', async () => {
      const { result, rerender } = render();
      await flush();
      await advance(3000);
      expect(result.current.status).toBe('polling');

      h.readData = true;
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: WALLET, enabled: true, mintType: 'wallet' });
      });

      expect(result.current.isMintedOnHub).toBe(true);
      expect(result.current.status).toBe('confirmed');
    });

    it('stops polling and freezes elapsed time after confirmation', async () => {
      const { result, rerender } = render();
      await flush();
      await advance(3000);

      h.readData = true;
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: WALLET, enabled: true, mintType: 'wallet' });
      });
      const frozen = result.current.elapsedTime;

      await advance(5000);

      expect(result.current.status).toBe('confirmed');
      expect(result.current.elapsedTime).toBe(frozen);
      expect(isPolling()).toBe(false);
    });
  });

  describe('timeout', () => {
    it('reports timeout once maxPollingTime elapses and stops polling', async () => {
      const { result } = render();
      await flush();

      await advance(MAX_POLLING_TIME - 1000);
      expect(result.current.status).toBe('polling');

      await advance(1000);

      expect(result.current.elapsedTime).toBe(MAX_POLLING_TIME);
      expect(result.current.status).toBe('timeout');
      expect(isPolling()).toBe(false);
    });

    it('prefers confirmed over timeout when both conditions hold', async () => {
      const { result, rerender } = render();
      await flush();
      await advance(MAX_POLLING_TIME);
      expect(result.current.status).toBe('timeout');

      h.readData = true;
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: WALLET, enabled: true, mintType: 'wallet' });
      });

      expect(result.current.status).toBe('confirmed');
    });
  });

  describe('support mints (balance based)', () => {
    it('uses balanceOf and confirms only when the balance rises above the starting balance', async () => {
      h.readData = undefined;
      const { result, rerender } = render({ mintType: 'support' });
      await flush();

      expect(queryOptions()).toBeDefined();
      expect((h.readOptions as { functionName: string }).functionName).toBe('balanceOf');

      // First observed balance becomes the baseline.
      h.readData = 0n;
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: WALLET, enabled: true, mintType: 'support' });
      });
      await advance(3000);
      expect(result.current.isMintedOnHub).toBe(false);
      expect(result.current.status).toBe('polling');

      h.readData = 1n;
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: WALLET, enabled: true, mintType: 'support' });
      });

      expect(result.current.isMintedOnHub).toBe(true);
      expect(result.current.status).toBe('confirmed');
    });

    it('treats any non-zero balance seen before the baseline is recorded as minted', async () => {
      // NOTE: documents current behaviour, not necessarily desired behaviour.
      // The baseline is recorded in an effect, so the first render that sees a
      // balance compares against 0n. A supporter who already holds tokens is
      // therefore reported as confirmed immediately.
      const { result, rerender } = render({ mintType: 'support' });
      await flush();

      h.readData = 5n;
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: WALLET, enabled: true, mintType: 'support' });
      });

      expect(result.current.isMintedOnHub).toBe(true);
    });
  });

  describe('a new run (different spokeHash / wallet)', () => {
    it('resets elapsed time and re-extracts the messageId for the new spoke tx', async () => {
      const { result, rerender } = render();
      await flush();
      await advance(4000);
      expect(result.current.elapsedTime).toBe(4000);
      expect(result.current.messageId).toBe(MESSAGE_ID);

      h.decode = () => ({ eventName: 'MintRequestForwarded', args: { messageId: MESSAGE_ID_2 } });
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH_2, wallet: WALLET, enabled: true, mintType: 'wallet' });
      });

      // Elapsed time belongs to the previous run and must not leak into the new one.
      expect(result.current.elapsedTime).toBe(0);

      await flush();
      expect(h.getTransactionReceipt).toHaveBeenLastCalledWith({ hash: SPOKE_HASH_2 });
      expect(result.current.messageId).toBe(MESSAGE_ID_2);
    });

    it('does not carry a previous run stale messageId into the new run', async () => {
      const { result, rerender } = render();
      await flush();
      expect(result.current.messageId).toBe(MESSAGE_ID);

      // New run whose receipt never resolves: the old messageId must not be
      // presented as if it belonged to the new spoke tx.
      h.getTransactionReceipt = vi.fn(() => new Promise<never>(() => {}));
      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH_2, wallet: WALLET, enabled: true, mintType: 'wallet' });
      });
      await flush();

      expect(result.current.messageId).not.toBe(MESSAGE_ID);
      expect(result.current.status).toBe('extracting');
    });

    it('resumes polling for a new run after a previous run timed out', async () => {
      const { result, rerender } = render();
      await flush();
      await advance(MAX_POLLING_TIME);
      expect(result.current.status).toBe('timeout');
      expect(isPolling()).toBe(false);

      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH_2, wallet: WALLET, enabled: true, mintType: 'wallet' });
      });
      await flush();
      await advance(INITIAL_DELAY);

      expect(result.current.elapsedTime).toBe(INITIAL_DELAY);
      expect(result.current.status).toBe('polling');
      expect(isPolling()).toBe(true);
    });

    it('starts a fresh run when only the wallet changes', async () => {
      const other = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
      const { result, rerender } = render();
      await flush();
      await advance(4000);
      expect(result.current.elapsedTime).toBe(4000);

      await act(async () => {
        rerender({ spokeHash: SPOKE_HASH, wallet: other, enabled: true, mintType: 'wallet' });
      });

      expect(result.current.elapsedTime).toBe(0);
    });
  });

  describe('controls', () => {
    it('refresh() refetches the hub query', async () => {
      const { result } = render();
      await flush();

      act(() => result.current.refresh());

      expect(h.refetch).toHaveBeenCalledTimes(1);
    });

    it('reset() clears elapsed time and the messageId', async () => {
      const { result } = render();
      await flush();
      await advance(4000);
      expect(result.current.messageId).toBe(MESSAGE_ID);
      expect(result.current.elapsedTime).toBe(4000);

      act(() => {
        result.current.reset();
      });

      expect(result.current.elapsedTime).toBe(0);
      expect(result.current.messageId).toBeUndefined();
      expect(result.current.status).toBe('extracting');

      // Clearing the messageId re-arms extraction, so it comes back on the next flush.
      await flush();
      expect(result.current.messageId).toBe(MESSAGE_ID);
    });
  });

  describe('cleanup', () => {
    it('leaves no pending timers on unmount', async () => {
      const { unmount } = render();
      await flush();
      await advance(3000);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
