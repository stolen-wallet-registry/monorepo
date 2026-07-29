/**
 * Backoff helpers for the relayer's "send the tx hash to my partner" retry chain.
 *
 * Extracted so the one piece of logic that makes a surviving timer safe — the tag check —
 * is testable without rendering the P2P pay steps.
 */

/** Base delay for exponential backoff (ms). */
export const BASE_RETRY_DELAY = 1000;

/** Maximum number of automatic retries before the user is shown a manual resend button. */
export const MAX_AUTO_RETRIES = 3;

/**
 * Delay before the given attempt (0-based).
 *
 * @param attempt - Number of failed attempts so far
 */
export function backoffDelay(attempt: number): number {
  return BASE_RETRY_DELAY * Math.pow(2, attempt);
}

/**
 * Apply a scheduled retry increment, ignoring timers that have been superseded.
 *
 * The send effect is allowed to re-run for reasons unrelated to retrying (a new tx hash, a
 * new partner peer ID, `hasSentHash` flipping). Clearing the pending backoff timer on every
 * such re-run killed the auto-retry chain outright; leaving it pending without this guard
 * double-incremented the attempt counter. Tagging each timer with the attempt count it was
 * scheduled from makes a superseded timer a no-op instead.
 *
 * @param previous - Current retry count at the moment the timer fires
 * @param scheduledFrom - Retry count at the moment the timer was scheduled
 * @returns the new retry count
 */
export function applyScheduledRetry(previous: number, scheduledFrom: number): number {
  return previous === scheduledFrom ? previous + 1 : previous;
}
