/**
 * When the chain — not the relayer — says an acknowledgement exists.
 *
 * Pure and separate from the component that uses it so the rule is testable without rendering,
 * and so the component file exports only a component (Fast Refresh).
 *
 * See `components/p2p/P2PWaitForAcknowledgement.tsx` for why this gate exists at all.
 */

/** The subset of `useContractDeadlines` / `useTxContractDeadlines` data this gate needs. */
export interface AcknowledgementDeadlines {
  /** Block at which the grace period opens. Zero when no acknowledgement is pending. */
  start: bigint;
  /** Block at which the registration window shuts. Zero when none is pending. */
  expiry: bigint;
  /** True once the window has closed — and also true for zeroed deadlines. */
  isExpired: boolean;
}

/**
 * Whether the chain shows an acknowledgement this flow can actually continue from.
 *
 * Two rejections, not one. Zeroed deadlines mean no acknowledgement was ever submitted — the
 * forged-hash case. Non-zero but expired means a real acknowledgement from an abandoned attempt
 * is still readable; advancing on that drops the victim into a grace period whose window has
 * already shut, which is a different way to reach the same dead end.
 *
 * @param deadlines - On-chain deadlines, or undefined while the read is in flight
 */
export function acknowledgementIsOnChain(deadlines: AcknowledgementDeadlines | undefined): boolean {
  if (!deadlines) return false;
  if (deadlines.start === 0n && deadlines.expiry === 0n) return false;
  return !deadlines.isExpired;
}
