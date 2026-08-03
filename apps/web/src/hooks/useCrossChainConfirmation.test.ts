/**
 * Tests for useCrossChainConfirmation.
 *
 * This hook is the on-chain answer to "did the registration actually land on the hub?" — the
 * P2P flow relies on it as evidence, and the register steps paint a success screen from it. It
 * was two near-identical hooks (wallet, transaction batch) until they were merged, so these
 * tests pin BOTH registries against the same shared machinery:
 *
 *   - which contract, ABI and args each registry reads, and on which chain
 *   - the `getHubChainId(...) ?? spokeChainId` fallback, whose absence made the hook run
 *     silently to `timeout` on a hub chain instead of ever confirming
 *   - the status machine (idle → waiting → polling → confirmed/timeout) and when polling stops
 *   - that a re-enabled run does not inherit the previous run's elapsed time
 *
 * wagmi is mocked so `useReadContract`'s result and the options it was called with are both
 * directly controllable — that lets us assert polling scheduling without a real query client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

const SPOKE = 11155420;
const HUB = 84532;
const UNCONFIGURED = 999999;

const WALLET_REGISTRY = '0x1111111111111111111111111111111111111111' as Address;
const FRAUD_HUB = '0x2222222222222222222222222222222222222222' as Address;

const h = vi.hoisted(() => ({
  /** Value returned as `data` from useReadContract. */
  readData: undefined as unknown,
  readIsError: false,
  /** Last options object useReadContract was called with. */
  readOptions: undefined as unknown,
  refetch: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useReadContract: (options: unknown) => {
    h.readOptions = options;
    return { data: h.readData, refetch: h.refetch, isError: h.readIsError, error: null };
  },
}));

vi.mock('@swr/chains', () => ({
  getWalletRegistryAddress: (chainId: number) => {
    if (chainId === UNCONFIGURED) throw new Error('no deployment');
    return '0x1111111111111111111111111111111111111111';
  },
  getFraudRegistryHubAddress: (chainId: number) => {
    if (chainId === UNCONFIGURED) throw new Error('no deployment');
    return '0x2222222222222222222222222222222222222222';
  },
}));

vi.mock('@/lib/chains/config', () => ({
  // undefined means "this chain IS the hub" — the case the `?? spokeChainId` fallback exists for
  getHubChainId: (chainId: number) => (chainId === SPOKE ? HUB : undefined),
  isSpokeChain: (chainId: number) => chainId === SPOKE,
}));

import {
  useCrossChainConfirmation,
  needsCrossChainConfirmation,
} from './useCrossChainConfirmation';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const OTHER_WALLET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const TX_HASH = ('0x' + 'ab'.repeat(32)) as Hash;
const CHAIN_ID_HASH = ('0x' + 'cd'.repeat(32)) as Hex;

const INITIAL_DELAY = 1000;
const POLL_INTERVAL = 3000;
const MAX_POLLING_TIME = 30_000;

/** Advance fake timers inside act() so React flushes resulting state updates. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Flush pending microtasks (the queueMicrotask elapsed-time reset) inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function readOptions() {
  return h.readOptions as {
    address: Address | undefined;
    functionName: string;
    args: readonly unknown[] | undefined;
    chainId: number | undefined;
    query: { enabled: boolean; refetchInterval: number | false };
  };
}

/** True when the hub query is both enabled and on a repeating schedule. */
function isPolling(): boolean {
  const { enabled, refetchInterval } = readOptions().query;
  return enabled === true && typeof refetchInterval === 'number' && refetchInterval > 0;
}

interface WalletProps {
  wallet: Address | undefined;
  spokeChainId: number | undefined;
  enabled: boolean;
}

function renderWallet(overrides: Partial<WalletProps> = {}) {
  const initialProps: WalletProps = {
    wallet: WALLET,
    spokeChainId: SPOKE,
    enabled: true,
    ...overrides,
  };
  return renderHook(
    (props: WalletProps) =>
      useCrossChainConfirmation({
        registry: 'wallet',
        wallet: props.wallet,
        spokeChainId: props.spokeChainId,
        enabled: props.enabled,
        pollInterval: POLL_INTERVAL,
        maxPollingTime: MAX_POLLING_TIME,
      }),
    { initialProps }
  );
}

interface TxProps {
  sampleTxHash: Hash | undefined;
  reportedChainId: Hex | undefined;
  spokeChainId: number | undefined;
  enabled: boolean;
}

function renderTx(overrides: Partial<TxProps> = {}) {
  const initialProps: TxProps = {
    sampleTxHash: TX_HASH,
    reportedChainId: CHAIN_ID_HASH,
    spokeChainId: SPOKE,
    enabled: true,
    ...overrides,
  };
  return renderHook(
    (props: TxProps) =>
      useCrossChainConfirmation({
        registry: 'transaction',
        sampleTxHash: props.sampleTxHash,
        reportedChainId: props.reportedChainId,
        spokeChainId: props.spokeChainId,
        enabled: props.enabled,
        pollInterval: POLL_INTERVAL,
        maxPollingTime: MAX_POLLING_TIME,
      }),
    { initialProps }
  );
}

describe('useCrossChainConfirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.readData = undefined;
    h.readIsError = false;
    h.readOptions = undefined;
    h.refetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('what each registry reads', () => {
    it('asks the wallet registry on the hub whether the wallet is registered', async () => {
      renderWallet();
      await flush();

      expect(readOptions().address).toBe(WALLET_REGISTRY);
      expect(readOptions().functionName).toBe('isWalletRegistered');
      expect(readOptions().args).toEqual([WALLET]);
      expect(readOptions().chainId).toBe(HUB);
    });

    // The batch is confirmed through one of its own hashes as a sentinel; the reported chain is
    // part of the key, so both have to reach the contract.
    it('asks the registry hub whether the sentinel transaction is registered', async () => {
      renderTx();
      await flush();

      expect(readOptions().address).toBe(FRAUD_HUB);
      expect(readOptions().functionName).toBe('isTransactionRegistered');
      expect(readOptions().args).toEqual([TX_HASH, CHAIN_ID_HASH]);
      expect(readOptions().chainId).toBe(HUB);
    });

    it('disables the query while a required input is missing', async () => {
      renderWallet({ wallet: undefined });
      await flush();
      expect(readOptions().query.enabled).toBe(false);

      renderTx({ reportedChainId: undefined });
      await flush();
      expect(readOptions().query.enabled).toBe(false);
    });

    // A chain with no deployment is a configuration gap, not a crash: the address lookup throws
    // and the hook disables the query rather than tearing the flow down.
    it('disables the query when the hub address cannot be resolved', async () => {
      renderWallet({ spokeChainId: UNCONFIGURED });
      await flush();

      expect(readOptions().address).toBeUndefined();
      expect(readOptions().query.enabled).toBe(false);
    });
  });

  /**
   * `getHubChainId` returns undefined when the chain already IS the hub. Without the
   * `?? spokeChainId` fallback there is no hub id, so no registry address, so the query never
   * runs — and the hook silently runs the full polling window out to `timeout` while the
   * registration sits confirmed on chain. The P2P flow treats that as "it never happened".
   */
  describe('the hub-chain fallback', () => {
    it('confirms on the hub chain itself for wallets', async () => {
      const { result } = renderWallet({ spokeChainId: HUB });
      await flush();

      expect(readOptions().chainId).toBe(HUB);
      expect(readOptions().address).toBe(WALLET_REGISTRY);
      expect(readOptions().query.enabled).toBe(true);

      h.readData = true;
      await advance(INITIAL_DELAY);
      expect(result.current.status).toBe('confirmed');
    });

    it('confirms on the hub chain itself for transaction batches', async () => {
      const { result } = renderTx({ spokeChainId: HUB });
      await flush();

      expect(readOptions().chainId).toBe(HUB);
      expect(readOptions().address).toBe(FRAUD_HUB);
      expect(readOptions().query.enabled).toBe(true);

      h.readData = true;
      await advance(INITIAL_DELAY);
      expect(result.current.status).toBe('confirmed');
    });
  });

  describe('status machine', () => {
    it('is idle and does not poll while disabled', async () => {
      const { result } = renderWallet({ enabled: false });
      await flush();

      expect(result.current.status).toBe('idle');
      expect(result.current.elapsedTime).toBe(0);
      expect(isPolling()).toBe(false);
    });

    it('waits for the initial delay before polling, then polls', async () => {
      const { result } = renderWallet();
      await flush();

      expect(result.current.status).toBe('waiting');
      expect(isPolling()).toBe(false);

      await advance(INITIAL_DELAY);

      expect(result.current.elapsedTime).toBe(INITIAL_DELAY);
      expect(result.current.status).toBe('polling');
      expect(isPolling()).toBe(true);
      expect(readOptions().query.refetchInterval).toBe(POLL_INTERVAL);
    });

    it('reports confirmed once the hub reflects the registration', async () => {
      const { result } = renderWallet();
      await flush();
      await advance(INITIAL_DELAY * 2);
      expect(result.current.status).toBe('polling');

      h.readData = true;
      await advance(1000);

      expect(result.current.isRegisteredOnHub).toBe(true);
      expect(result.current.status).toBe('confirmed');
    });

    it('reports timeout once maxPollingTime elapses', async () => {
      const { result } = renderWallet();
      await flush();

      await advance(MAX_POLLING_TIME - 1000);
      expect(result.current.status).toBe('polling');

      await advance(1000);
      expect(result.current.status).toBe('timeout');
    });

    // A late hub delivery still counts. Timeout is what the UI says, not a decision to stop
    // looking, so a confirmation arriving afterwards must still win.
    it('prefers a late confirmation over an existing timeout', async () => {
      const { result } = renderTx();
      await flush();
      await advance(MAX_POLLING_TIME);
      expect(result.current.status).toBe('timeout');

      h.readData = true;
      await advance(1000);

      expect(result.current.status).toBe('confirmed');
    });

    it('treats a non-boolean read as not-yet-registered', async () => {
      h.readData = undefined;
      const { result } = renderWallet();
      await flush();
      await advance(INITIAL_DELAY);

      expect(result.current.isRegisteredOnHub).toBe(false);
      expect(result.current.status).toBe('polling');
    });
  });

  describe('runs', () => {
    // Elapsed time belonging to a previous run would make the next one derive `timeout` on its
    // first render, before it had polled even once.
    it('zeroes elapsed time when disabled mid-run', async () => {
      const { result, rerender } = renderWallet();
      await flush();
      await advance(5000);
      expect(result.current.elapsedTime).toBe(5000);

      rerender({ wallet: WALLET, spokeChainId: SPOKE, enabled: false });
      await flush();

      expect(result.current.status).toBe('idle');
      expect(result.current.elapsedTime).toBe(0);
    });

    // The next tick measures from the new run's start, not the old one's — a new subject does
    // not inherit the previous subject's progress towards timeout.
    it('restarts the clock when the subject changes', async () => {
      const { result, rerender } = renderWallet();
      await flush();
      await advance(5000);
      expect(result.current.elapsedTime).toBe(5000);

      await act(async () => {
        rerender({ wallet: OTHER_WALLET, spokeChainId: SPOKE, enabled: true });
      });
      await advance(1000);

      expect(result.current.elapsedTime).toBe(1000);
      expect(readOptions().args).toEqual([OTHER_WALLET]);
    });

    // The reported chain is half of the transaction key, so a change to it is a different
    // subject even when the sentinel hash is unchanged.
    it('restarts the clock when only the reported chain changes', async () => {
      const { result, rerender } = renderTx();
      await flush();
      await advance(5000);
      expect(result.current.elapsedTime).toBe(5000);

      await act(async () => {
        rerender({
          sampleTxHash: TX_HASH,
          reportedChainId: ('0x' + 'ef'.repeat(32)) as Hex,
          spokeChainId: SPOKE,
          enabled: true,
        });
      });
      await advance(1000);

      expect(result.current.elapsedTime).toBe(1000);
    });
  });

  describe('controls', () => {
    it('refresh() refetches the hub query', async () => {
      const { result } = renderWallet();
      await flush();

      act(() => result.current.refresh());

      expect(h.refetch).toHaveBeenCalledTimes(1);
    });

    it('reset() clears elapsed time', async () => {
      const { result } = renderWallet();
      await flush();
      await advance(5000);

      act(() => {
        result.current.reset();
      });

      expect(result.current.elapsedTime).toBe(0);
    });

    it('leaves no pending timers on unmount', async () => {
      const { unmount } = renderWallet();
      await flush();
      await advance(3000);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('needsCrossChainConfirmation', () => {
    it('is true only for spoke chains', () => {
      expect(needsCrossChainConfirmation(SPOKE)).toBe(true);
      expect(needsCrossChainConfirmation(HUB)).toBe(false);
      expect(needsCrossChainConfirmation(undefined)).toBe(false);
    });
  });
});
