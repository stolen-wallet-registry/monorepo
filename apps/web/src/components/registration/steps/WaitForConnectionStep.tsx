/**
 * Wait for P2P connection step.
 *
 * - Registeree: Shows form to connect to relayer by peer ID
 * - Relayer: Shows peer ID for registeree to connect to
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import { PeerIdDisplay, PeerConnectForm } from '@/components/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import type { Libp2p } from 'libp2p';
import { logger } from '@/lib/logger';

/** How long to wait for the relayer's reply before giving up on the pairing. */
const PARTNER_ACK_TIMEOUT_MS = 30_000;

export interface WaitForConnectionStepProps {
  /** Called when connection is established */
  onComplete: () => void;
  /** The role in P2P flow */
  role: 'registeree' | 'relayer';
  /** Getter for the libp2p node (avoids React serialization of Proxy) */
  getLibp2p: () => Libp2p | null;
  /**
   * Proof that the relayer replied and accepted this pairing — set by the page's inbound
   * CONNECT handler, not by this component.
   *
   * A resolved `passStreamData` is NOT that proof: writing to a stream a peer silently drops
   * still resolves, so advancing on the write alone walked a victim whose CONNECT had been
   * REFUSED (someone else was pinned first) straight into signing. When this prop is
   * supplied, advancement waits for it and times out with an error instead.
   *
   * Optional so pages that have not yet wired a reply signal keep their previous behaviour
   * rather than hanging.
   */
  partnerAcknowledged?: boolean;
}

/**
 * Step for establishing P2P connection between registeree and relayer.
 */
export function WaitForConnectionStep({
  onComplete,
  role,
  getLibp2p,
  partnerAcknowledged,
}: WaitForConnectionStepProps) {
  const { address } = useAccount();
  const { peerId, isInitialized, setPartnerPeerId, clearPartnerPeerId, setConnectedToPeer } =
    useP2PStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Set once our CONNECT is on the wire, cleared when the relayer answers or we give up.
  const [awaitingPartner, setAwaitingPartner] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gateOnPartnerAck = partnerAcknowledged !== undefined;

  const clearAckTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearAckTimeout, [clearAckTimeout]);

  // Whether we are still waiting on the relayer's reply, derived rather than mirrored into
  // state: adjusting local state in the effect below would render one stale frame showing
  // "waiting" after the reply had already arrived.
  const stillAwaitingPartner = awaitingPartner && !partnerAcknowledged;

  // The relayer answered. This is the only signal that proves the pairing was accepted rather
  // than refused in silence, so it is the only thing that advances the flow. Side effects only —
  // the local flags are left alone, because `onComplete` navigates away from this step.
  useEffect(() => {
    if (!awaitingPartner || !partnerAcknowledged) return;
    clearAckTimeout();
    setConnectedToPeer(true);
    logger.p2p.info('Relayer acknowledged the pairing');
    onComplete();
  }, [awaitingPartner, partnerAcknowledged, clearAckTimeout, setConnectedToPeer, onComplete]);

  // Registeree connects to relayer
  const handleConnect = useCallback(
    async (remotePeerId: string) => {
      const libp2p = getLibp2p();
      if (!libp2p) {
        setConnectionError('P2P node not initialized');
        return;
      }

      setIsConnecting(true);
      setConnectionError(null);
      let waitingForPartner = false;

      try {
        logger.p2p.info('Connecting to relayer', { remotePeerId });

        // Get connection to remote peer
        const connection = await getPeerConnection({ libp2p, remotePeerId });

        // Pin BEFORE speaking. The relayer answers the handshake by opening a CONNECT stream
        // back on this same connection, and the registeree's guard never adopts a partner from
        // an inbound stream (see peerGuard's `mayPin`) — so if the pin landed after the write,
        // the relayer's reply could arrive first and be rejected as coming from a stranger.
        setPartnerPeerId(remotePeerId);

        // Send connect handshake with registeree address
        await passStreamData({
          connection,
          protocols: [PROTOCOLS.CONNECT],
          streamData: {
            form: { registeree: address },
            p2p: { partnerPeerId: peerId || undefined },
          },
        });

        // A resolved write is not an accepted pairing. When the page supplies a reply signal,
        // wait for it; the relayer may have refused this CONNECT because another peer was
        // pinned first, and that refusal looks exactly like success from here.
        if (gateOnPartnerAck) {
          logger.p2p.info('CONNECT sent; waiting for the relayer to acknowledge');
          // Keeps the form disabled through the wait: the `finally` below must not treat the
          // early return as the end of the attempt.
          waitingForPartner = true;
          setAwaitingPartner(true);
          clearAckTimeout();
          timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null;
            setAwaitingPartner(false);
            setIsConnecting(false);
            setConnectionError(
              'The relayer did not answer. They may already be paired with someone else — ask them to restart their page, then try again.'
            );
            clearPartnerPeerId();
            logger.p2p.warn('No CONNECT reply from relayer before timeout', { remotePeerId });
          }, PARTNER_ACK_TIMEOUT_MS);
          return;
        }

        setConnectedToPeer(true);

        logger.p2p.info('Connected to relayer successfully');
        onComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        logger.p2p.error('Connection to relayer failed', {}, err as Error);
        setConnectionError(message);
        // Undo the optimistic pin above. The handshake never completed, so leaving it set
        // would have the guard silently drop streams from every other peer — including the
        // correct one, if the user retries with a different peer ID — with only a log line
        // to explain why nothing happens.
        clearPartnerPeerId();
      } finally {
        if (!waitingForPartner) setIsConnecting(false);
      }
    },
    [
      getLibp2p,
      address,
      peerId,
      setPartnerPeerId,
      clearPartnerPeerId,
      setConnectedToPeer,
      onComplete,
      gateOnPartnerAck,
      clearAckTimeout,
    ]
  );

  if (!isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-muted-foreground">Connecting to relay server...</p>
      </div>
    );
  }

  if (role === 'relayer') {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Share your Peer ID with the person registering their stolen wallet. They will use it to
            connect to you.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col items-center space-y-4">
          <p className="text-sm text-muted-foreground">Your Peer ID (click to copy):</p>
          <PeerIdDisplay peerId={peerId} />
          <p className="text-xs text-muted-foreground">Waiting for connection from registeree...</p>
        </div>
      </div>
    );
  }

  // Registeree view
  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Enter the Peer ID shared by your relayer to establish a secure P2P connection. They will
          pay the gas fees on your behalf.
        </AlertDescription>
      </Alert>

      {stillAwaitingPartner && (
        <Alert>
          <AlertDescription>Waiting for the relayer to accept the connection...</AlertDescription>
        </Alert>
      )}

      <PeerConnectForm
        onConnect={handleConnect}
        isConnecting={isConnecting}
        error={connectionError}
      />
    </div>
  );
}
