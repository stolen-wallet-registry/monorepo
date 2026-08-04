/**
 * Batch back-fill semantics.
 *
 * `WalletRegistered` and `TransactionRegistered` deliberately carry no `batchId` and no
 * operator — that is a per-entry gas decision in the contracts, not an oversight. The batch
 * summary event (`BatchCreated` / `TransactionBatchRegistered` / `TransactionBatchCreated`)
 * fires LATER IN THE SAME TRANSACTION, and the indexer back-fills the per-entry rows by
 * joining on the shared `transactionHash`.
 *
 * This module holds the two halves of that operation that can be reasoned about without a
 * database:
 *
 *  - the values written (`walletBackfillValues` / `transactionBackfillValues`) — used verbatim
 *    by the handlers in `src/index.ts`, so testing them tests the shipped code;
 *  - `selectBackfillTargets`, an executable SPECIFICATION of the `WHERE transactionHash = ?
 *    AND batchId IS NULL` clause. It is a model, not the query: the real write goes through
 *    drizzle in the handler. It exists so the guard's intent — "a second batch in the same tx
 *    must not re-tag the first batch's entries" — is pinned by a test rather than by a comment.
 *
 * Kept free of ponder imports so it is unit testable; `src/**` is otherwise loaded by ponder
 * as indexing functions.
 */

import type { Address, Hex } from 'viem';

/** The subset of a per-entry row the back-fill reads. */
export interface BackfillCandidate {
  transactionHash: Hex;
  batchId: string | null;
}

/**
 * Rows a batch summary event should claim: same transaction, not already claimed.
 *
 * The `batchId === null` half is the load-bearing one. Every registry call today emits exactly
 * one batch summary per transaction, so matching on `transactionHash` alone would be correct
 * — but only by accident. Should a transaction ever carry two batches (batched bridge
 * delivery is the plausible route), the second summary would otherwise re-tag the first
 * batch's entries with its own id and silently corrupt both batches. The guard makes the
 * one-call-per-tx property something the indexer enforces rather than something it assumes.
 */
export function selectBackfillTargets<T extends BackfillCandidate>(
  rows: readonly T[],
  transactionHash: Hex
): T[] {
  return rows.filter((row) => row.transactionHash === transactionHash && row.batchId === null);
}

/**
 * Columns a wallet `BatchCreated` writes onto its entries.
 *
 * `operator` is included because `WalletRegistered` carries no operator either, and
 * `event.transaction.from` is the wrong answer for it — that is the relayer/multisig/AA
 * account that paid for the transaction, not the approved operator. The authoritative value is
 * decoded from the event's `operatorId` (`OperatorSubmitter._getOperatorId()` is
 * `bytes32(uint256(uint160(msg.sender)))`).
 */
export function walletBackfillValues(batchId: bigint | string, operator: Address) {
  return { batchId: batchId.toString(), operator };
}

/**
 * Columns a transaction batch summary writes onto its entries.
 *
 * No operator field: `transactionInBatch.reporter` is already populated per entry (and is the
 * zero address for operator submissions — see the column's doc comment), so operator
 * attribution goes through `batchId` → `transactionBatch` instead.
 */
export function transactionBackfillValues(batchId: bigint | string) {
  return { batchId: batchId.toString() };
}
