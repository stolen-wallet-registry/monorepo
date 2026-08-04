import { describe, it, expect } from 'vitest';
import { selectionMatchesSignedBatch } from './selectionConsistency';

/**
 * V27: the registration step signs over `dataHash`, computed from `selectedTxHashes`, while the
 * table renders `selectedTxDetails`. Those are two independent arrays. If they diverge, the user
 * reviews one batch and signs another — and the resulting signature is cryptographically genuine,
 * so nothing downstream can detect the substitution. This predicate is what makes the step refuse
 * to sign; the acknowledgement step already had the equivalent guard.
 */
describe('selectionMatchesSignedBatch', () => {
  const a = '0xaaa1';
  const b = '0xbbb2';
  const c = '0xccc3';

  it('accepts matching sets', () => {
    expect(selectionMatchesSignedBatch([a, b], [{ hash: a }, { hash: b }])).toBe(true);
  });

  // Details come back ordered by transaction history, selections by click order. Order
  // divergence is normal and must not block signing.
  it('accepts the same set in a different order', () => {
    expect(selectionMatchesSignedBatch([a, b, c], [{ hash: c }, { hash: a }, { hash: b }])).toBe(
      true
    );
  });

  it('accepts an empty batch', () => {
    expect(selectionMatchesSignedBatch([], [])).toBe(true);
  });

  // The core attack: the shown row is swapped for a different transaction while the count
  // stays identical, so a length-only check would pass it.
  it('rejects a substituted hash at equal length', () => {
    expect(selectionMatchesSignedBatch([a, b], [{ hash: a }, { hash: c }])).toBe(false);
  });

  it('rejects extra signed hashes not shown to the user', () => {
    expect(selectionMatchesSignedBatch([a, b, c], [{ hash: a }, { hash: b }])).toBe(false);
  });

  it('rejects extra shown rows not covered by the signature', () => {
    expect(selectionMatchesSignedBatch([a], [{ hash: a }, { hash: b }])).toBe(false);
  });

  // A duplicate in the details array makes the two lengths agree while the shown set is
  // genuinely smaller — the size check on the Set is what catches this.
  it('rejects duplicate detail rows masking a missing transaction', () => {
    expect(selectionMatchesSignedBatch([a, b], [{ hash: a }, { hash: a }])).toBe(false);
  });

  // The mirror image, and the case the original implementation let through: the duplicate is
  // on the SIGNED side. Lengths agree (2/2), the shown set has two members so `shown.size`
  // equals `selectedTxHashes.length`, and every signed hash (`a`, twice) is in the shown set —
  // so every check passed while `b` was on screen without being signed and `a` was signed
  // twice. Rejecting duplicates only on the details side is not enough; membership has to be
  // checked in both directions.
  it('rejects duplicate signed hashes masking a transaction shown but never signed', () => {
    expect(selectionMatchesSignedBatch([a, a], [{ hash: a }, { hash: b }])).toBe(false);
  });

  // Same defect at a larger size, to pin that the fix is a real distinctness check and not a
  // special case for length 2.
  it('rejects duplicate signed hashes at larger batch sizes', () => {
    expect(selectionMatchesSignedBatch([a, b, b], [{ hash: a }, { hash: b }, { hash: c }])).toBe(
      false
    );
  });

  it('rejects when details are empty but hashes are not', () => {
    expect(selectionMatchesSignedBatch([a], [])).toBe(false);
  });
});
