/**
 * PeerIdDisplay component for showing and copying the local peer ID.
 *
 * Used by the relayer to share their peer ID with the registeree.
 */

import { ClipboardCopy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@swr/ui';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { logger } from '@/lib/logger';

/**
 * Truncate a string in the middle, preserving start and end.
 */
function truncateMiddle(str: string, startChars: number, endChars: number): string {
  if (str.length <= startChars + endChars) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}

interface PeerIdDisplayProps {
  /** The peer ID to display */
  peerId: string | null;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Displays the local peer ID with copy functionality.
 *
 * Shows a button with the peer ID that copies to clipboard when clicked.
 */
export function PeerIdDisplay({ peerId, isLoading }: PeerIdDisplayProps) {
  const { copy } = useCopyToClipboard();

  const handleCopy = async () => {
    if (!peerId) return;

    const success = await copy(peerId);

    if (success) {
      logger.p2p.info('Peer ID copied to clipboard', { peerId });
      // Defer toast to escape React's render cycle (avoids flushSync warning from sonner)
      setTimeout(() => {
        toast.success('Copied!', {
          description: `Peer ID: ${truncateMiddle(peerId, 15, 15)}`,
          duration: 2000,
        });
      }, 0);
    } else {
      logger.p2p.warn('Failed to copy peer ID to clipboard');
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

  if (!peerId) {
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
      aria-label={`Copy Peer ID ${peerId} to clipboard`}
    >
      <span className="font-bold truncate">Peer ID: {truncateMiddle(peerId, 8, 8)}</span>
      <ClipboardCopy className="ml-2 h-4 w-4 flex-shrink-0" />
    </Button>
  );
}
