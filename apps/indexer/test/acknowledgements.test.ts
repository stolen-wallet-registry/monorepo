import { describe, expect, it } from 'vitest';
import { resolveTransactionAckStatus } from '../src/lib/acknowledgements';

const COMMITTED = `0x${'a'.repeat(64)}`;
const OTHER = `0x${'b'.repeat(64)}`;

describe('resolveTransactionAckStatus', () => {
  // The happy path: the reporter acknowledged a batch and then registered that same batch on
  // the hub. `registerTransactions` cannot succeed with any other dataHash, so a match here
  // means both signatures were genuinely produced.
  it('marks a hub-side batch with the committed dataHash as registered', () => {
    expect(
      resolveTransactionAckStatus({
        current: 'pending',
        committedDataHash: COMMITTED,
        batchDataHash: COMMITTED,
        isCrossChain: false,
      })
    ).toBe('registered');
  });

  // The wallet-side 'superseded' case, transaction edition: the exact batch the reporter
  // committed to got registered by a spoke delivery while their acknowledgement was still
  // pending. The registration is real, so 'pending' would be wrong — but they never signed the
  // second message, so 'registered' would claim a signature that does not exist.
  it('marks a cross-chain batch with the committed dataHash as superseded, not registered', () => {
    expect(
      resolveTransactionAckStatus({
        current: 'pending',
        committedDataHash: COMMITTED,
        batchDataHash: COMMITTED,
        isCrossChain: true,
      })
    ).toBe('superseded');
  });

  /**
   * THE REGRESSION. The previous implementation marked ANY pending acknowledgement for the
   * reporter as 'registered' the moment a `TransactionBatchRegistered` named them — including
   * a batch delivered from a spoke, which the reporter never signed for on the hub.
   *
   * A batch with a different dataHash is somebody else's batch. It does not consume the
   * on-chain acknowledgement, so the reporter can still complete their own flow: the row must
   * be left exactly as it is. 'registered' would invent a signature and 'superseded' would
   * invent a completion.
   */
  it('leaves a pending acknowledgement untouched when the batch dataHash differs', () => {
    expect(
      resolveTransactionAckStatus({
        current: 'pending',
        committedDataHash: COMMITTED,
        batchDataHash: OTHER,
        isCrossChain: true,
      })
    ).toBeNull();

    expect(
      resolveTransactionAckStatus({
        current: 'pending',
        committedDataHash: COMMITTED,
        batchDataHash: OTHER,
        isCrossChain: false,
      })
    ).toBeNull();
  });

  it('does nothing when the reporter has no acknowledgement at all', () => {
    expect(
      resolveTransactionAckStatus({
        current: null,
        committedDataHash: null,
        batchDataHash: COMMITTED,
        isCrossChain: false,
      })
    ).toBeNull();
  });

  // A settled row is a historical fact. A later unrelated batch naming the same reporter must
  // never be able to rewrite it — in particular, a genuine 'registered' from an earlier block
  // must not be downgraded to 'superseded' by a spoke delivery that arrives afterwards.
  it.each(['registered', 'superseded'] as const)('never re-decides a %s row', (current) => {
    expect(
      resolveTransactionAckStatus({
        current,
        committedDataHash: COMMITTED,
        batchDataHash: COMMITTED,
        isCrossChain: true,
      })
    ).toBeNull();
  });
});
