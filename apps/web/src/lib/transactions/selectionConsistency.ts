/**
 * Whether the transactions shown to the user are exactly the transactions that will be signed.
 *
 * Compared as sets, not as sequences: `selectedTxDetails` is ordered by transaction history
 * while `selectedTxHashes` is ordered by selection, so order divergence is expected and
 * harmless. What is NOT harmless is a difference in membership or count — that means the table
 * is rendering one batch while `dataHash` commits to another, which is the V27 exploit.
 *
 * Duplicates are rejected on BOTH sides, and each side needs its own check. Comparing lengths
 * and then testing one-way membership is not enough, because a duplicate silently consumes a
 * slot that a real divergence is hiding in:
 *
 *  - Duplicate in the details: `[A, B]` signed against `[A, A]` shown. Lengths agree, but only
 *    one transaction is actually on screen while two are signed. Caught by comparing the shown
 *    Set's size against the array length.
 *  - Duplicate in the signed hashes: `[A, A]` signed against `[A, B]` shown. Lengths agree, the
 *    shown Set has two members, and every signed hash IS in the shown set — so the original
 *    one-way check passed while `B` sat on screen unsigned and `A` was signed twice. Only a
 *    distinctness check on `selectedTxHashes` catches this.
 *
 * With both sides deduplicated and the lengths equal, one-way membership implies the other
 * direction, so the two sets are genuinely identical.
 *
 * Lives outside the component file so Fast Refresh can preserve component state, and because
 * both signing steps enforce the same invariant.
 */
export function selectionMatchesSignedBatch(
  selectedTxHashes: readonly string[],
  selectedTxDetails: readonly { hash: string }[]
): boolean {
  if (selectedTxHashes.length !== selectedTxDetails.length) return false;

  const signed = new Set(selectedTxHashes);
  if (signed.size !== selectedTxHashes.length) return false;

  const shown = new Set(selectedTxDetails.map((detail) => detail.hash));
  if (shown.size !== selectedTxDetails.length) return false;

  return selectedTxHashes.every((hash) => shown.has(hash));
}
