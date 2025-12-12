/**
 * WaitingForData component for P2P flow waiting states.
 *
 * Displays a loading state while waiting for data from the connected peer.
 */

import { Loader2 } from 'lucide-react';

interface WaitingForDataProps {
  /** Custom message to display */
  message?: string;
  /** What we're waiting for (for logging/debugging) */
  waitingFor?: string;
}

/**
 * Displays a waiting state during P2P data transfer.
 */
export function WaitingForData({
  message = 'Waiting for data from peer...',
  waitingFor,
}: WaitingForDataProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">{message}</p>
      {waitingFor && <p className="text-xs text-muted-foreground/60">Waiting for: {waitingFor}</p>}
    </div>
  );
}
