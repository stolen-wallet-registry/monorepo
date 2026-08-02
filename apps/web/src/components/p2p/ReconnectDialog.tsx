/**
 * Dialog for manual P2P reconnection when auto-reconnect fails.
 *
 * Allows users to:
 * - Retry connection to the same peer
 * - Re-pin the partner from a FRESH PAIRING CODE, if their peer ID changed
 *
 * SECURITY (audit V4, residual gap). V4 bound the gas-paying helper to one wallet by making it
 * paste a pairing token before dialing, recorded "before any wire data exists". This dialog was
 * never reviewed against that: it accepted a bare peer ID behind a `startsWith('12D3KooW')`
 * check and handed it to `onReconnected`, which every page turns into `setPartnerPeerId` +
 * `setConnectedToPeer(true)` with `pairedWallet` untouched. Circuit-relay connections drop
 * routinely, so this dialog opens in normal operation — which made "my peer ID changed" a
 * complete bypass of the pin that `peerGuard.authorizeStreamPeer` enforces everywhere else.
 *
 * The rule now matches the initial pairing: a new peer ID is the legitimate thing to change,
 * a new WALLET is the attack. So the helper re-pins only from a pairing code naming the same
 * `pairedWallet` it already agreed to pay for.
 *
 * The party being helped (registeree / reporter) publishes a pairing code and never holds one
 * for its partner, so it has no artifact to check a typed peer ID against. Rather than offer an
 * unauthenticated re-pin dressed up as a control, that side gets no typed-identity path at all
 * — it clears the pin instead, which lets `peerGuard`'s `mayPin` adopt the partner's next
 * CONNECT exactly as it did the first one. No new trust is extended either way.
 */

import { useState, useCallback } from 'react';
import { RefreshCw, Link2, Loader2 } from 'lucide-react';
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
import { decodePairingToken, isSameAddress } from '@/lib/p2p/pairingToken';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

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
  /**
   * The wallet this session agreed OUT OF BAND to pay for — the address half of the pairing
   * token the helper pasted (`lib/p2p/pairingToken.ts`).
   *
   * Present (helper side): a re-pin is allowed only from a pairing code naming this same
   * wallet. Absent (party being helped): there is nothing to check a peer ID against, so the
   * typed-identity path is not offered at all — see the module comment.
   */
  pairedWallet?: Address | null;
  /**
   * Drop the pinned partner so the peer guard can adopt their next CONNECT.
   *
   * The recovery path for the side with no pairing artifact. Without it, a partner who closed
   * their tab (and so came back with a new peer ID) can never re-dial, because
   * `authorizeStreamPeer` rejects every stream from anyone but the stale pin.
   */
  onClearPairing?: () => void;
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
 *   getLibp2p={getLibp2p}
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
  pairedWallet,
  onClearPairing,
}: ReconnectDialogProps) {
  const [newPairingCode, setNewPairingCode] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'retry' | 'new'>('retry');

  /** Only the side holding a pairing token can verify a replacement one. */
  const canRepair = Boolean(pairedWallet);

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

  /**
   * Re-pin the partner from a fresh pairing code.
   *
   * The wallet check runs BEFORE the dial, not after: dialing is what a peer needs to start
   * talking to us, so a code we are going to refuse must never reach `reconnectToPeer`.
   */
  const handleConnectNew = useCallback(async () => {
    const libp2p = getLibp2p();
    if (!libp2p) {
      setError('Cannot connect: P2P node not initialized');
      return;
    }

    // Belt and braces: the input is not rendered without a paired wallet, but a re-pin with
    // nothing to check against is the whole finding, so it fails closed here too rather than
    // relying on a render condition staying correct.
    if (!pairedWallet) {
      setError(
        'This session has no pairing code to check a new connection against. Ask your partner to reconnect, or start over.'
      );
      return;
    }

    // The decoder owns every shape rejection, including the bare-peer-ID one — it is the only
    // place that can say "that is a Peer ID on its own, ask for the full code", and a user who
    // is told merely "invalid" goes looking for a way around the check.
    const decoded = decodePairingToken(newPairingCode);
    if (!decoded.ok) {
      logger.p2p.warn('Rejected reconnect pairing code', { error: decoded.error });
      setError(decoded.message);
      return;
    }

    const { peerId, address } = decoded.token;

    // A new peer ID is the legitimate reason to be in this dialog. A new WALLET is not: the
    // helper is here to finish paying for the wallet it already agreed to, and accepting a
    // different one would make reconnect a second, unguarded way to change that binding.
    if (!isSameAddress(address, pairedWallet)) {
      logger.p2p.warn('Rejected reconnect pairing code naming a different wallet', {
        claimed: address,
        paired: pairedWallet,
      });
      setError(
        'That pairing code is for a different wallet than the one you agreed to pay for. Do not continue — ask your partner for a code for the original wallet, or start over.'
      );
      return;
    }

    setIsReconnecting(true);
    setError(null);

    try {
      logger.p2p.info('Re-pinning partner from a fresh pairing code', { remotePeerId: peerId });

      const { connection, result } = await reconnectToPeer(libp2p, peerId);

      if (connection && result.success) {
        onReconnected(peerId);
        onOpenChange(false);
        setNewPairingCode('');
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
  }, [getLibp2p, newPairingCode, pairedWallet, onReconnected, onOpenChange]);

  /**
   * Party-being-helped side: forget the partner so their next CONNECT can be adopted.
   *
   * Extends no new trust — it restores exactly the trust-on-first-use the initial pairing had,
   * which `peerGuard` documents as the deliberately cheaper race to lose on this side.
   */
  const handleClearPairing = useCallback(() => {
    logger.p2p.info('Clearing pinned partner so a fresh CONNECT can be adopted');
    onClearPairing?.();
    onOpenChange(false);
  }, [onClearPairing, onOpenChange]);

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
              aria-pressed={mode === 'retry'}
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
              aria-pressed={mode === 'new'}
              onClick={() => {
                setMode('new');
                setError(null);
              }}
            >
              <Link2 className="mr-2 h-4 w-4" />
              New pairing code
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

          {mode === 'new' && canRepair && (
            <div className="space-y-2">
              <Label htmlFor="new-pairing-code">
                Enter {partnerLabel}&apos;s new pairing code:
              </Label>
              <Input
                id="new-pairing-code"
                placeholder="swr1:<peer id>:<wallet address>"
                value={newPairingCode}
                onChange={(e) => setNewPairingCode(e.target.value)}
                disabled={isReconnecting}
              />
              <p className="text-sm text-muted-foreground">
                Ask your {partnerLabel} for a fresh pairing code. It must name the same wallet you
                originally agreed to pay for — a code for any other wallet will be refused.
              </p>
            </div>
          )}

          {/* No pairing token on this side, so a typed peer ID could not be checked against
              anything. Clearing the pin is the honest recovery: it re-opens the same
              trust-on-first-use the original pairing used, rather than pretending a typed
              identity was verified. */}
          {mode === 'new' && !canRepair && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This session has no pairing code to check a new connection against, so a Peer ID
                typed here could not be verified.
              </p>
              <p className="text-sm text-muted-foreground">
                If your {partnerLabel} restarted and now has a different Peer ID, clear the pairing
                and they can connect to you again using your pairing code.
              </p>
              {onClearPairing && (
                <Button variant="outline" size="sm" onClick={handleClearPairing}>
                  Clear the pairing and wait for them to reconnect
                </Button>
              )}
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
            <Button
              onClick={handleConnectNew}
              disabled={isReconnecting || !canRepair || !newPairingCode.trim()}
            >
              {isReconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
