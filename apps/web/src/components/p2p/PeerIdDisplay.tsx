/**
 * PeerIdDisplay shows the pairing artifact the local user shares out of band.
 *
 * Used by the party being helped (registeree / reporter) to hand their helper one string.
 * When `walletAddress` is supplied it renders the full pairing token — peer ID *and* the
 * wallet being registered — because the helper has to know which wallet it is agreeing to pay
 * for before it accepts anything (audit V4). Without an address it degrades to the bare peer
 * ID, which is only correct where no wallet is being authorized.
 */

import { ClipboardCopy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@swr/ui';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { encodePairingToken } from '@/lib/p2p/pairingToken';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

/**
 * Truncate a string in the middle, preserving start and end.
 */
function truncateMiddle(str: string, startChars: number, endChars: number): string {
  if (str.length <= startChars + endChars) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}

interface PeerIdDisplayProps {
  /** The local peer ID */
  peerId: string | null;
  /**
   * Wallet being registered. Present turns this into a pairing-code button; absent leaves it
   * a bare peer ID.
   */
  walletAddress?: Address | null;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Displays the local pairing token (or peer ID) with copy functionality.
 */
export function PeerIdDisplay({ peerId, walletAddress, isLoading }: PeerIdDisplayProps) {
  const { copy } = useCopyToClipboard();

  const value = peerId && walletAddress ? encodePairingToken(peerId, walletAddress) : peerId;
  const label = walletAddress ? 'Pairing code' : 'Peer ID';

  const handleCopy = async () => {
    if (!value) return;

    const success = await copy(value);

    if (success) {
      logger.p2p.info('Pairing artifact copied to clipboard', { peerId });
      // Defer toast to escape React's render cycle (avoids flushSync warning from sonner)
      setTimeout(() => {
        toast.success('Copied!', {
          description: `${label}: ${truncateMiddle(value, 15, 15)}`,
          duration: 2000,
        });
      }, 0);
    } else {
      logger.p2p.warn('Failed to copy pairing artifact to clipboard');
      setTimeout(() => {
        toast.error('Copy Failed', {
          description: 'Could not copy to clipboard',
        });
      }, 0);
    }
  };

  if (isLoading) {
    return (
      <Button className="w-full" disabled aria-busy="true" aria-live="polite">
        <span className="font-bold">Connecting to relay...</span>
      </Button>
    );
  }

  if (!value) {
    return (
      <Button className="w-full" variant="destructive" disabled>
        <span className="font-bold">P2P not initialized</span>
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      onClick={handleCopy}
      aria-label={`Copy ${label} ${value} to clipboard`}
    >
      <span className="font-bold truncate">
        {label}: {truncateMiddle(value, 8, 8)}
      </span>
      <ClipboardCopy className="ml-2 h-4 w-4 flex-shrink-0" />
    </Button>
  );
}
