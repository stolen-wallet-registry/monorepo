/**
 * Acknowledgement status transitions.
 *
 * An acknowledgement row is a claim about what a user SIGNED, so getting its status wrong is
 * not a display bug: recording `registered` for a flow whose second signature was never
 * produced fabricates the exact artefact the two-phase design exists to make real. The wallet
 * side already guards this (`BatchCreated` downgrades `registered` -> `superseded` when an
 * operator batch, not the registeree, did the registering). This module holds the transaction
 * side of the same decision.
 *
 * Kept free of ponder imports so it is unit testable; `src/**` is otherwise loaded by ponder as
 * indexing functions.
 */

/** Statuses a transaction-batch acknowledgement row can hold. */
export type TransactionAckStatus = 'pending' | 'registered' | 'superseded';

export interface TransactionAckDecisionInput {
  /** Current status of the stored row, or null when there is no pending acknowledgement. */
  current: TransactionAckStatus | null;
  /** `dataHash` the acknowledgement committed to, or null when there is no row. */
  committedDataHash: string | null;
  /** `dataHash` carried by the `TransactionBatchRegistered` event being processed. */
  batchDataHash: string;
  /** Whether this batch arrived via a cross-chain delivery rather than a hub-side registration. */
  isCrossChain: boolean;
}

/**
 * Decide what a `TransactionBatchRegistered` event should do to the reporter's acknowledgement.
 *
 * Returns the new status, or `null` to leave the row exactly as it is.
 *
 * The `dataHash` comparison is an EXACT discriminator rather than a heuristic:
 * `TransactionRegistry.registerTransactions` reverts with
 * `TransactionRegistry__DataHashMismatch` unless the batch's hash equals the one the
 * acknowledgement committed to, so a match on a hub-side batch IS that reporter's completed
 * two-phase flow, and a mismatch is definitionally somebody else's batch.
 *
 * The three outcomes:
 *
 *  - match + hub-side   -> `registered`. The reporter signed both messages.
 *  - match + cross-chain -> `superseded`. The exact batch they committed to was registered by
 *    another route while their acknowledgement was pending. The registration is real; the
 *    second signature was never produced. Same meaning as `walletAcknowledgement.superseded`.
 *  - mismatch           -> unchanged. A foreign batch does not consume the on-chain
 *    acknowledgement (the hub deletes `_pendingAcknowledgements[reporter]` only on that
 *    reporter's own `registerTransactions` call), so the reporter can still complete their
 *    flow. `registered` would invent a signature; `superseded` would invent a completion.
 *    This is the case the previous implementation got wrong — it marked ANY pending
 *    acknowledgement for the reporter as `registered`.
 *
 * Only a `pending` row is a live claim. A settled row is left alone: re-deciding it is not this
 * event's job, and a genuine `registered` from an earlier block must never be downgraded by a
 * later unrelated batch.
 */
export function resolveTransactionAckStatus({
  current,
  committedDataHash,
  batchDataHash,
  isCrossChain,
}: TransactionAckDecisionInput): TransactionAckStatus | null {
  if (current !== 'pending') return null;
  if (committedDataHash !== batchDataHash) return null;
  return isCrossChain ? 'superseded' : 'registered';
}
