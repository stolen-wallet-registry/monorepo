/**
 * Grace period timer status derivation, split from the component file so the
 * component module only exports components.
 */

/**
 * The one state this timer is in.
 *
 * `useCountdownTimer` exposes overlapping booleans — most notably `isRunning`
 * and `isWaitingForBlock` are both true once the estimate has run out but a
 * later block poll raises the estimate again. Collapsing them here makes the
 * display precedence a property of the type rather than of the order of the
 * component's early returns.
 */
export type GracePeriodStatus =
  /** Block data not available yet. */
  | 'loading'
  /** Estimate hit zero; the target block has not been mined. */
  | 'waiting-for-block'
  /** Target block reached — registration may proceed. */
  | 'expired'
  /** Counting down. */
  | 'running'
  /** Time left, but the countdown is not ticking. */
  | 'paused';

/** Timer fields this component needs, as returned by `useCountdownTimer`. */
export interface GracePeriodTimerState {
  isExpired: boolean;
  isRunning: boolean;
  isWaitingForBlock: boolean;
}

/**
 * Collapses the hook's booleans into the single status the UI renders.
 *
 * Shared so both grace period steps resolve precedence identically instead of
 * each re-deriving it at the call site.
 */
export function getGracePeriodStatus(
  { isExpired, isRunning, isWaitingForBlock }: GracePeriodTimerState,
  isLoading = false
): GracePeriodStatus {
  if (isLoading) return 'loading';
  if (isExpired) return 'expired';
  if (isWaitingForBlock) return 'waiting-for-block';
  return isRunning ? 'running' : 'paused';
}
