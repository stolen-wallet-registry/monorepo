import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { resolveWindowBlock, isWindowBlockStale, WINDOW_BLOCK_HISTORY_LIMIT } from './windowBlock';
import type { Hash } from '@/lib/types/ethereum';

const BLOCK_HASH = `0x${'ab'.repeat(32)}` as Hash;

/** Minimal stand-in for the two reads the helper performs. */
function fakeClient(currentBlock: bigint, hash: Hash | null = BLOCK_HASH) {
  return {
    getBlockNumber: vi.fn(async () => currentBlock),
    getBlock: vi.fn(async () => ({ hash })),
  } as unknown as PublicClient;
}

describe('resolveWindowBlock', () => {
  // currentBlock - 1: the contract requires windowBlock < block.number, and the head block is
  // not yet in blockhash() range from the contract's point of view.
  it('commits to the block below the head and returns its real hash', async () => {
    const client = fakeClient(1000n);

    const { windowBlock, windowBlockHash } = await resolveWindowBlock({ client });

    expect(windowBlock).toBe(999n);
    expect(windowBlockHash).toBe(BLOCK_HASH);
  });

  it('accepts a window block at or after the grace period start', async () => {
    const client = fakeClient(1000n);

    await expect(resolveWindowBlock({ client, gracePeriodStart: 999n })).resolves.toMatchObject({
      windowBlock: 999n,
    });
  });

  // Signing before the grace period has elapsed produces a guaranteed
  // TimingConfig__WindowBlockBeforeGracePeriod revert, so it fails here instead.
  it('refuses to sign over a block that precedes the grace period start', async () => {
    const client = fakeClient(1000n);

    await expect(resolveWindowBlock({ client, gracePeriodStart: 1500n })).rejects.toThrow(
      /grace period/i
    );
  });

  it('rejects a chain with no mined history', async () => {
    await expect(resolveWindowBlock({ client: fakeClient(0n) })).rejects.toThrow(
      /no mined blocks/i
    );
  });

  it('rejects a block with no hash', async () => {
    await expect(resolveWindowBlock({ client: fakeClient(1000n, null) })).rejects.toThrow(
      /not been mined/i
    );
  });

  it('rejects when no client is available', async () => {
    await expect(resolveWindowBlock({ client: undefined })).rejects.toThrow(/no rpc client/i);
  });
});

/**
 * W-2. `WINDOW_BLOCK_HISTORY_LIMIT` was declared, exported, and referenced nowhere — the check
 * it was created for was never written, so a relayer who took longer than the window paid gas
 * for a guaranteed `TimingConfig__WindowBlockTooOld` revert. On Base's 2s blocks the window is
 * about 8.5 minutes, which one RPC retry can exceed.
 */
describe('isWindowBlockStale', () => {
  it('is not stale one block inside the window', () => {
    const windowBlock = 1_000_000n;
    expect(isWindowBlockStale(windowBlock, windowBlock + WINDOW_BLOCK_HISTORY_LIMIT - 1n)).toBe(
      false
    );
  });

  // The contract's comparison is `>=`, so the boundary block is already dead.
  it('is stale exactly at the limit', () => {
    const windowBlock = 1_000_000n;
    expect(isWindowBlockStale(windowBlock, windowBlock + WINDOW_BLOCK_HISTORY_LIMIT)).toBe(true);
  });

  it('is stale well past the limit', () => {
    expect(isWindowBlockStale(1_000_000n, 1_000_000n + 5_000n)).toBe(true);
  });

  it('is not stale at the committed block itself', () => {
    expect(isWindowBlockStale(1_000_000n, 1_000_000n)).toBe(false);
  });

  /**
   * A `currentBlock` BEHIND the committed block is a lagging RPC node, not an aged-out
   * commitment. Naive subtraction underflows bigint into a huge positive number and would
   * report every such read as stale — blocking a perfectly good signature.
   */
  it('treats a lagging chain head as not stale', () => {
    expect(isWindowBlockStale(1_000_000n, 999_990n)).toBe(false);
  });

  /**
   * Unknown is not stale. An outstanding read must not assert a verdict — that is the
   * `nonce-unknown` case, reported separately, and acknowledgement signatures carry no window
   * commitment at all.
   */
  it('asserts nothing when either value is unknown', () => {
    expect(isWindowBlockStale(undefined, 1_000_000n)).toBe(false);
    expect(isWindowBlockStale(1_000_000n, undefined)).toBe(false);
    expect(isWindowBlockStale(undefined, undefined)).toBe(false);
  });
});
