/**
 * Dialog for manual P2P reconnection when auto-reconnect fails.
 *
 * Allows users to:
 * - Retry connection to the same peer
 * - Enter a new peer ID if the partner's ID changed
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Link2 } from 'lucide-react';
import type { Libp2p } from '@libp2p/interface';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
} from '@swr/ui';
import { reconnectToPeer } from '@/lib/p2p/reconnect';
import { processMessageQueue } from '@/lib/p2p/messageQueue';
import { logger } from '@/lib/logger';

export interface ReconnectDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
  /** Getter for libp2p node (avoids React serialization of Proxy) */
  getLibp2p: () => Libp2p | null;
  /** Current partner peer ID (if known) */
  currentPeerId?: string | null;
  /** Role of the partner (for display) */
  partnerRole: 'relayer' | 'registeree';
  /** Callback when reconnection succeeds */
  onReconnected: (peerId: string) => void;
  /** Callback when user cancels */
  onCancel?: () => void;
}

/**
 * Dialog for manual P2P reconnection.
 *
 * Shown when auto-reconnect fails and user needs to take action.
 *
 * @example
 * ```tsx
 * <ReconnectDialog
 *   open={showReconnect}
 *   onOpenChange={setShowReconnect}
 *   libp2p={libp2p}
 *   currentPeerId={partnerPeerId}
 *   partnerRole="relayer"
 *   onReconnected={(peerId) => {
 *     setPartnerPeerId(peerId);
 *     setConnectionError(null);
 *   }}
 * />
 * ```
 */
export function ReconnectDialog({
  open,
  onOpenChange,
  getLibp2p,
  currentPeerId,
  partnerRole,
  onReconnected,
  onCancel,
}: ReconnectDialogProps) {
  const [newPeerId, setNewPeerId] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'retry' | 'new'>('retry');

  const handleRetry = useCallback(async () => {
    const libp2p = getLibp2p();
    if (!libp2p || !currentPeerId) {
      setError('Cannot retry: missing connection information');
      return;
    }

    setIsReconnecting(true);
    setError(null);

    try {
      logger.p2p.info('Manual reconnection attempt', { remotePeerId: currentPeerId });

      const { connection, result } = await reconnectToPeer(libp2p, currentPeerId);

      if (connection && result.success) {
        // Process any queued messages
        const queueResult = await processMessageQueue(libp2p, currentPeerId);
        logger.p2p.info('Reconnected and processed queue', {
          processed: queueResult.processed,
          failed: queueResult.failed,
        });

        onReconnected(currentPeerId);
        onOpenChange(false);
      } else {
        setError(result.error || 'Failed to reconnect. Please try again or enter a new Peer ID.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.p2p.error('Manual reconnection failed', {}, err as Error);
      setError(`Connection failed: ${message}`);
    } finally {
      setIsReconnecting(false);
    }
  }, [getLibp2p, currentPeerId, onReconnected, onOpenChange]);

  const handleConnectNew = useCallback(async () => {
    const libp2p = getLibp2p();
    if (!libp2p) {
      setError('Cannot connect: P2P node not initialized');
      return;
    }

    const peerId = newPeerId.trim();
    if (!peerId) {
      setError('Please enter a Peer ID');
      return;
    }

    // Basic validation - peer IDs start with 12D3KooW for Ed25519
    if (!peerId.startsWith('12D3KooW') && !peerId.startsWith('Qm')) {
      setError('Invalid Peer ID format. It should start with "12D3KooW" or "Qm".');
      return;
    }

    setIsReconnecting(true);
    setError(null);

    try {
      logger.p2p.info('Connecting to new peer ID', { remotePeerId: peerId });

      const { connection, result } = await reconnectToPeer(libp2p, peerId);

      if (connection && result.success) {
        onReconnected(peerId);
        onOpenChange(false);
        setNewPeerId('');
      } else {
        setError(result.error || 'Failed to connect to the specified peer.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.p2p.error('Connect to new peer failed', {}, err as Error);
      setError(`Connection failed: ${message}`);
    } finally {
      setIsReconnecting(false);
    }
  }, [getLibp2p, newPeerId, onReconnected, onOpenChange]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const partnerLabel = partnerRole === 'relayer' ? 'relayer' : 'registeree';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connection Lost</DialogTitle>
          <DialogDescription>
            The connection to your {partnerLabel} was lost. Choose how to proceed:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Mode selection */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'retry' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('retry');
                setError(null);
              }}
              disabled={!currentPeerId}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Connection
            </Button>
            <Button
              variant={mode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('new');
                setError(null);
              }}
            >
              <Link2 className="mr-2 h-4 w-4" />
              New Peer ID
            </Button>
          </div>

          {mode === 'retry' && currentPeerId && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Current Peer ID:</Label>
              <code className="block text-xs bg-muted p-2 rounded break-all">{currentPeerId}</code>
              <p className="text-sm text-muted-foreground">
                Click &quot;Reconnect&quot; to try connecting to the same {partnerLabel} again.
              </p>
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-2">
              <Label htmlFor="new-peer-id">Enter {partnerLabel}&apos;s new Peer ID:</Label>
              <Input
                id="new-peer-id"
                placeholder="12D3KooW..."
                value={newPeerId}
                onChange={(e) => setNewPeerId(e.target.value)}
                disabled={isReconnecting}
              />
              <p className="text-sm text-muted-foreground">
                Ask your {partnerLabel} for their current Peer ID and enter it above.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isReconnecting}>
            Cancel
          </Button>
          {mode === 'retry' ? (
            <Button onClick={handleRetry} disabled={isReconnecting || !currentPeerId}>
              {isReconnecting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Reconnecting...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reconnect
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleConnectNew} disabled={isReconnecting || !newPeerId.trim()}>
              {isReconnecting ? (
                <>
                  <Link2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
