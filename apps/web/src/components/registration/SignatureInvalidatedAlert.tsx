/**
 * Warning shown on a pay step when the revert made the stored signature unusable.
 *
 * Retry on these steps does not resubmit — it discards the signature and sends the user back
 * to sign. Saying so before they press it is the point; all four pay steps show the same
 * message, so it lives here rather than being copied into each.
 */

import { Alert, AlertDescription } from '@swr/ui';
import { AlertCircle } from 'lucide-react';

interface SignatureInvalidatedAlertProps {
  /**
   * Whether the on-chain registration window has closed. When it has, re-signing cannot
   * help and Retry restarts the flow from the acknowledgement step instead.
   */
  windowClosed?: boolean;
}

export function SignatureInvalidatedAlert({
  windowClosed = false,
}: SignatureInvalidatedAlertProps) {
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
