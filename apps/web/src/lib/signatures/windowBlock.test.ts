import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { resolveWindowBlock } from './windowBlock';
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
