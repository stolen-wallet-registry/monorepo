/**
 * Terminal error alert that carries the control needed to act on it.
 *
 * Registration steps have several states that end the step: the on-chain window closed, the
 * contract has no pending acknowledgement, the cached signature is gone. Each of these used to
 * render prose telling the user to "go back" or "start over" — but `StepIndicator` is not
 * interactive and no flow exposed a back control, so the instruction named an action the UI
 * could not perform. On the grace-period steps that stranded a user who had already paid for an
 * acknowledgement on chain.
 *
 * Every terminal alert therefore ships the button that performs its own recovery, and the prose
 * refers to that button rather than to navigation that does not exist.
 */

import type { ReactNode } from 'react';
import { Alert, AlertDescription, Button } from '@swr/ui';
import { AlertCircle } from 'lucide-react';

export interface FlowRecoveryAlertProps {
  /** What went wrong, phrased so it reads into the button label. */
  children: ReactNode;
  /** Button text — describe the recovery, e.g. "Start Over" or "Back to Signing". */
  actionLabel: string;
  /** Performs the recovery. */
  onAction: () => void;
  /** Additional class names for the alert. */
  className?: string;
}

export function FlowRecoveryAlert({
  children,
  actionLabel,
  onAction,
  className,
}: FlowRecoveryAlertProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="space-y-3">
          <p>{children}</p>
          <Button type="button" variant="outline" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
