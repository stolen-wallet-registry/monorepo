/**
 * Warning shown on a pay step when the revert made the stored signature unusable.
 *
 * Retry on these steps does not resubmit — it discards the signature and sends the user back
 * to sign. Saying so before they press it is the point; all four pay steps show the same
 * message, so it lives here rather than being copied into each.
 *
 * The P2P relayed steps show it too, via `partner`. The rule is identical there — the
 * signature is discarded, never resubmitted — but the recovery is not something the reader
 * can perform: the signature belongs to their partner, on another machine, so the text has
 * to tell them what the partner must do and whether the request actually reached them.
 */

import { Alert, AlertDescription } from '@swr/ui';
import { AlertCircle } from 'lucide-react';

interface SignatureInvalidatedAlertProps {
  /**
   * Whether the on-chain registration window has closed. When it has, re-signing cannot
   * help and Retry restarts the flow from the acknowledgement step instead.
   */
  windowClosed?: boolean;
  /**
   * P2P relayed steps only. Omit for the standard and self-relay steps, where the reader
   * holds their own signature and Retry can simply return them to signing.
   */
  partner?: {
    /**
     * Whether the re-sign request reached the partner over P2P.
     * `null` before Retry has been pressed, so nothing is claimed either way.
     */
    notified: boolean | null;
    /** What the reader calls their partner in this flow. */
    role: 'registeree' | 'reporter';
  };
}

export function SignatureInvalidatedAlert({
  windowClosed = false,
  partner,
}: SignatureInvalidatedAlertProps) {
  if (partner) {
    const { notified, role } = partner;

    const what = windowClosed
      ? `The registration window has closed, so this signature can never be submitted. The ${role} has to start again from the acknowledgement — you cannot sign on their behalf.`
      : `This signature can no longer be used, and it is not yours to replace. The ${role} has to sign again.`;

    const delivery =
      notified === true
        ? ' A request to sign again has been sent to them.'
        : notified === false
          ? ' The request could not be delivered — contact them directly and ask them to sign again.'
          : ' Retry will discard it and ask them to sign again.';

    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {what}
          {delivery}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        {windowClosed
          ? 'The registration window has closed. Retry will restart the process from the acknowledgement step.'
          : 'This signature can no longer be used. Retry will take you back to sign a new one.'}
      </AlertDescription>
    </Alert>
  );
}
