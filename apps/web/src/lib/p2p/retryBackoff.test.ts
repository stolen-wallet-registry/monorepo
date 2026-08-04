import { describe, it, expect } from 'vitest';
import { applyScheduledRetry, backoffDelay, BASE_RETRY_DELAY } from './retryBackoff';

describe('backoffDelay', () => {
  it('doubles with each failed attempt', () => {
    expect(backoffDelay(0)).toBe(BASE_RETRY_DELAY);
    expect(backoffDelay(1)).toBe(BASE_RETRY_DELAY * 2);
    expect(backoffDelay(2)).toBe(BASE_RETRY_DELAY * 4);
  });
});

describe('applyScheduledRetry', () => {
  // Positive path: the ordinary chain still advances, which is what the previous
  // clear-the-timer-on-every-re-run behaviour broke.
  it('advances the attempt count for a timer that is still current', () => {
    expect(applyScheduledRetry(2, 2)).toBe(3);
  });

  // The double-increment the clearing was introduced to prevent: a timer scheduled from an
  // earlier attempt fires after the count has already moved on and must do nothing.
  it('ignores a timer scheduled from a superseded attempt', () => {
    expect(applyScheduledRetry(3, 2)).toBe(3);
    expect(applyScheduledRetry(5, 0)).toBe(5);
  });

  // A manual resend increments the count directly; any timer pending from before it is
  // therefore stale and must not add a second increment on top.
  it('ignores a timer that a manual resend has already superseded', () => {
    const afterManualResend = applyScheduledRetry(1, 1); // -> 2, as if user pressed Resend
    expect(applyScheduledRetry(afterManualResend, 1)).toBe(afterManualResend);
  });
});
