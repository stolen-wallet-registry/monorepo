/**
 * Whether the transactions shown to the user are exactly the transactions that will be signed.
 *
 * Compared as sets, not as sequences: `selectedTxDetails` is ordered by transaction history
 * while `selectedTxHashes` is ordered by selection, so order divergence is expected and
 * harmless. What is NOT harmless is a difference in membership or count — that means the table
 * is rendering one batch while `dataHash` commits to another, which is the V27 exploit.
 *
 * Duplicates are rejected on both sides: set equality alone would accept `[A, A]` against a
 * single shown detail while the submitted array differs in length.
 *
 * Lives outside the component file so Fast Refresh can preserve component state, and because
 * both signing steps enforce the same invariant.
 */
export function selectionMatchesSignedBatch(
  selectedTxHashes: readonly string[],
  selectedTxDetails: readonly { hash: string }[]
): boolean {
  if (selectedTxHashes.length !== selectedTxDetails.length) return false;
  const shown = new Set(selectedTxDetails.map((detail) => detail.hash));
  return shown.size === selectedTxHashes.length && selectedTxHashes.every((h) => shown.has(h));
}
