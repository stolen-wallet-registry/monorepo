/**
 * Helpers for converting selected `UserTransaction`s into the serializable
 * `StoredTransactionDetail` shape held by `useTransactionFormStore`.
 *
 * These exist because the same conversion was duplicated across the three
 * transaction registration pages, each written as
 * `transactions.filter((tx) => hashes.includes(tx.hash)).map(...)`. That is two
 * passes over `transactions`, and `Array.prototype.includes` inside the
 * predicate makes the lookup O(n) — so selecting from a long history was
 * O(transactions x selection). A `Set` lookup plus a single `flatMap` pass
 * makes it linear.
 */

import type { UserTransaction } from '@/hooks/transactions';
import type { Hash } from '@/lib/types/ethereum';
import type { StoredTransactionDetail } from '@/stores/transactionFormStore';

/**
 * Convert a single transaction to its stored (JSON-serializable) form.
 *
 * `value` and `blockNumber` are bigints on-chain and must be stringified before
 * they hit Zustand's persist layer.
 */
export function toStoredTransactionDetail(tx: UserTransaction): StoredTransactionDetail {
  return {
    hash: tx.hash,
    to: tx.to,
    value: tx.value.toString(),
    blockNumber: tx.blockNumber.toString(),
    timestamp: tx.timestamp,
  };
}

/**
 * Pick the transactions whose hashes appear in `selectedHashes` and convert them
 * to stored details, in a single pass with O(1) membership lookups.
 *
 * Result order follows `transactions`, not `selectedHashes`.
 */
export function selectStoredTransactionDetails(
  transactions: readonly UserTransaction[],
  selectedHashes: readonly Hash[]
): StoredTransactionDetail[] {
  const selected = new Set(selectedHashes);
  return transactions.flatMap((tx) =>
    selected.has(tx.hash) ? [toStoredTransactionDetail(tx)] : []
  );
}
