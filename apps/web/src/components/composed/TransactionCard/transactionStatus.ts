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
 * Callers with cross-chain states (`relaying`, `hub-confirmed`, `hub-timeout`) resolve those
 * BEFORE calling this, via {@link deriveCrossChainStatus} — they depend on hub polling, which is
 * not part of the local ladder.
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

/** The subset of `useCrossChainConfirmation().status` that maps to a card status. */
export type CrossChainConfirmationStatus =
  | 'idle'
  | 'waiting'
  | 'polling'
  | 'confirmed'
  | 'timeout'
  | 'error';

/**
 * Map cross-chain hub-confirmation state to the card's status.
 *
 * Returns `null` when the hub state does not determine the card — the caller then falls through
 * to {@link deriveTransactionStatus} for the local ladder.
 *
 * Shared by both register steps ON PURPOSE. These two had drifted to opposite answers for a hub
 * timeout: the transaction flow warned and held, while the wallet flow reported `confirmed` and
 * auto-advanced to a success screen — telling a fraud victim their wallet was registered when
 * the hub, which is the canonical registry, never acknowledged the bridged message. A victim who
 * believes they are protected stops looking for a problem, so the failure is silent and costly.
 *
 * The honest answer is neither extreme: the spoke transaction really did succeed, so this is
 * "submitted, hub confirmation pending" — `hub-timeout`, which keeps the bridge explorer link on
 * screen and requires the user to acknowledge via "Continue Anyway" rather than being told it
 * finished. Keeping the mapping here is what stops the two flows disagreeing again.
 */
export function deriveCrossChainStatus(
  crossChainStatus: CrossChainConfirmationStatus
): TransactionStatus | null {
  if (crossChainStatus === 'confirmed') return 'hub-confirmed';
  if (crossChainStatus === 'polling' || crossChainStatus === 'waiting') return 'relaying';
  if (crossChainStatus === 'timeout') return 'hub-timeout';
  return null;
}
