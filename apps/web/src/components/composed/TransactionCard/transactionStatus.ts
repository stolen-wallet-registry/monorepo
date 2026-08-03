/**
 * The status a pay step shows for its on-chain write, and the one ladder that derives it.
 *
 * Six pay steps (wallet ack/reg, transaction ack/reg, and both P2P relayed variants) each
 * hand-wrote the same `isConfirmed → isConfirming → isPending → isError` cascade. The order is
 * not arbitrary and getting it wrong is silent:
 *
 *   - `isConfirmed` first, because wagmi's write hook can still report `isPending` from a
 *     later interaction while the receipt for the landed transaction is already in;
 *   - `isError` LAST, so a failure that is being retried does not paint the card red while the
 *     replacement transaction is in flight.
 *
 * Pure and React-free, so the ladder is testable without a wallet or a chain.
 */

export type TransactionStatus =
  | 'idle'
  | 'submitting'
  | 'pending'
  | 'confirmed'
  | 'failed'
  // Cross-chain states (spoke → hub)
  | 'relaying' // Spoke tx confirmed, waiting for hub delivery
  | 'hub-confirmed' // Hub chain shows wallet as registered
  | 'hub-timeout'; // Cross-chain confirmation timed out (spoke tx confirmed, hub unconfirmed)

/** The write-hook state a pay step derives its card status from. */
export interface TransactionStatusState {
  /** Receipt for the write is in. */
  isConfirmed: boolean;
  /** Transaction sent, receipt not yet in. */
  isConfirming: boolean;
  /** Wallet prompt open / write not yet broadcast. */
  isPending: boolean;
  /** The write hook is in its error state. */
  isError: boolean;
  /**
   * The component's own "submit handler is running" flag, covering the gap before wagmi
   * commits `isPending`. The P2P steps guard that window with a ref instead and pass nothing.
   */
  isSubmitting?: boolean;
  /**
   * A failure caught by the component itself (bad params, a throw from the submit handler)
   * rather than reported by the write hook. Only the four non-P2P steps have one.
   */
  localError?: string | null;
}

/**
 * Map write-hook state to the card's status.
 *
 * Callers with cross-chain states (`relaying`, `hub-confirmed`, `hub-timeout`) decide those
 * BEFORE calling this — they depend on hub polling, which is not part of the local ladder, and
 * the two register steps deliberately map a hub timeout differently from each other.
 */
export function deriveTransactionStatus({
  isConfirmed,
  isConfirming,
  isPending,
  isError,
  isSubmitting = false,
  localError = null,
}: TransactionStatusState): TransactionStatus {
  if (isConfirmed) return 'confirmed';
  if (isConfirming) return 'pending';
  if (isPending || isSubmitting) return 'submitting';
  if (isError || localError) return 'failed';
  return 'idle';
}
