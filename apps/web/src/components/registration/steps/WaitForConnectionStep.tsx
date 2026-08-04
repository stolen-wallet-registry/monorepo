/**
 * Wait for P2P connection step.
 *
 * - Registeree / reporter (the party being helped): shows its pairing code and waits.
 * - Relayer (the party paying gas): pastes that pairing code and dials.
 *
 * SECURITY (audit V4). The direction of the out-of-band exchange is the whole fix, so it is
 * worth stating why it runs this way round. The helper is agreeing to spend its own money
 * marking ONE specific wallet as permanently stolen, and the only artifact these two people
 * exchange outside the P2P channel used to be the *helper's* peer ID — which carries no
 * statement about which wallet is being registered. That left the wallet to arrive inside the
 * peer's own CONNECT payload, i.e. whatever the peer that connected first said it was. No
 * handshake closes that: an attacker naming its own wallet can sign any challenge you set.
 *
 * So the artifact now originates from the party being helped and carries both halves
 * (`swr1:<peerId>:<address>`), which means that party publishes and the helper dials. The
 * helper therefore holds the wallet address before it accepts anything, and payment is gated
 * on the EIP-712-recovered signer matching it (`useRelayedSignatureReview`). Nobody types an
 * extra field and no screen was added — the two components simply swapped sides.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import { PeerIdDisplay, PeerConnectForm } from '@/components/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { decodePairingToken } from '@/lib/p2p/pairingToken';
import type { Libp2p } from 'libp2p';
import { logger } from '@/lib/logger';

/** How long to wait for the partner's reply before giving up on the pairing. */
const PARTNER_ACK_TIMEOUT_MS = 30_000;

export interface WaitForConnectionStepProps {
  /** Called when connection is established */
  onComplete: () => void;
  /** The role in P2P flow */
  role: 'registeree' | 'relayer';
  /** Getter for the libp2p node (avoids React serialization of Proxy) */
  getLibp2p: () => Libp2p | null;
  /**
   * Proof that the partner replied and accepted this pairing — set by the page's inbound
   * CONNECT handler, not by this component.
   *
   * For the dialing side (relayer) a resolved `passStreamData` is NOT that proof: writing to a
   * stream a peer silently drops still resolves, so advancing on the write alone walks past a
   * CONNECT that was REFUSED (someone else was pinned first). For the waiting side it is the
   * arrival of the dialer's CONNECT.
   *
   * Optional so pages that have not yet wired a reply signal keep their previous behaviour
   * rather than hanging.
   */
  partnerAcknowledged?: boolean;
}

/**
 * Step for establishing P2P connection between the party being helped and their relayer.
 */
export function WaitForConnectionStep({
  onComplete,
  role,
  getLibp2p,
  partnerAcknowledged,
}: WaitForConnectionStepProps) {
  const { address } = useAccount();
  const {
    peerId,
    isInitialized,
    setPartnerPeerId,
    clearPartnerPeerId,
    setPairedWallet,
    clearPairedWallet,
    setConnectedToPeer,
  } = useP2PStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Set once our CONNECT is on the wire, cleared when the partner answers or we give up.
  const [awaitingPartner, setAwaitingPartner] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The gas-paying side pastes the pairing code and dials; the other side publishes it. */
  const isDialer = role === 'relayer';
  const gateOnPartnerAck = partnerAcknowledged !== undefined;

  const clearAckTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearAckTimeout, [clearAckTimeout]);

  // Whether we are still waiting on the partner's reply, derived rather than mirrored into
  // state: adjusting local state in the effect below would render one stale frame showing
  // "waiting" after the reply had already arrived.
  const stillAwaitingPartner = awaitingPartner && !partnerAcknowledged;

  // The dialer may only advance once its own CONNECT has been answered; the waiting side has
  // nothing of its own to correlate against and advances on the partner's CONNECT itself.
  const readyToAdvance = Boolean(
    gateOnPartnerAck && partnerAcknowledged && (isDialer ? awaitingPartner : true)
  );

  // The pairing was accepted rather than refused in silence — the only thing that advances the
  // flow. Side effects only; the local flags are left alone because `onComplete` navigates
  // away from this step.
  useEffect(() => {
    if (!readyToAdvance) return;
    clearAckTimeout();
    setConnectedToPeer(true);
    logger.p2p.info('Partner acknowledged the pairing', { role });
    // Not a parent/child state mirror, which is what `no-prop-callback-in-effect` is for.
    // `onComplete` is `goToNextStep` — a one-shot navigation fired when the partner's reply
    // arrives, and the rule's canonical fix (hoist the shared value into a Provider) does not
    // apply: the value it would hoist, `partnerAcknowledged`, is ALREADY shared store state.
    // For the dialer the advance additionally depends on `awaitingPartner` — local proof that
    // THIS peer sent the CONNECT — which cannot move up to the page.
    // react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect
    onComplete();
  }, [readyToAdvance, role, clearAckTimeout, setConnectedToPeer, onComplete]);

  /**
   * Relayer: decode the pasted pairing code, bind to both halves of it, then dial.
   *
   * Both the peer ID and the wallet are taken from the code and from nothing else. A bare
   * legacy peer ID is refused here rather than accepted with an unknown wallet, because
   * accepting it silently restores exactly the unauthorized-wallet path the code exists to
   * close.
   */
  const handleConnect = useCallback(
    async (rawToken: string) => {
      const libp2p = getLibp2p();
      if (!libp2p) {
        setConnectionError('P2P node not initialized');
        return;
      }

      const decoded = decodePairingToken(rawToken);
      if (!decoded.ok) {
        logger.p2p.warn('Rejected pairing code', { error: decoded.error });
        setConnectionError(decoded.message);
        return;
      }
      const { peerId: remotePeerId, address: pairedWallet } = decoded.token;

      setIsConnecting(true);
      setConnectionError(null);
      let waitingForPartner = false;

      try {
        logger.p2p.info('Connecting to partner from pairing code', { remotePeerId });

        const connection = await getPeerConnection({ libp2p, remotePeerId });

        // Bind BEFORE speaking, to both halves. The partner answers by opening a CONNECT
        // stream back on this same connection and the guard never adopts a partner from an
        // inbound stream on this side (see peerGuard's `mayPin`), so a pin that landed after
        // the write would have the reply rejected as coming from a stranger. `pairedWallet` is
        // what payment is later gated on, and it is recorded here — before any wire data
        // exists — precisely so nothing on the wire can influence it.
        setPartnerPeerId(remotePeerId);
        setPairedWallet(pairedWallet);

        await passStreamData({
          connection,
          protocols: [PROTOCOLS.CONNECT],
          streamData: {
            form: { relayer: address },
            p2p: { partnerPeerId: peerId || undefined },
          },
        });

        // A resolved write is not an accepted pairing. When the page supplies a reply signal,
        // wait for it; the partner may have refused this CONNECT because another peer was
        // pinned first, and that refusal looks exactly like success from here.
        if (gateOnPartnerAck) {
          logger.p2p.info('CONNECT sent; waiting for the partner to acknowledge');
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
              'Your partner did not answer. They may already be paired with someone else — ask them to restart their page and send you a fresh pairing code, then try again.'
            );
            clearPartnerPeerId();
            clearPairedWallet();
            logger.p2p.warn('No CONNECT reply from partner before timeout', { remotePeerId });
          }, PARTNER_ACK_TIMEOUT_MS);
          return;
        }

        setConnectedToPeer(true);

        logger.p2p.info('Connected to partner successfully');
        onComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        logger.p2p.error('Connection to partner failed', {}, err as Error);
        setConnectionError(message);
        // Undo the optimistic binding above. The handshake never completed, so leaving it set
        // would have the guard silently drop streams from every other peer — including the
        // correct one, if the user retries with a different code — with only a log line to
        // explain why nothing happens, and would leave a stale wallet authorized for payment.
        clearPartnerPeerId();
        clearPairedWallet();
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
      setPairedWallet,
      clearPairedWallet,
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

  // Relayer view: paste the partner's pairing code.
  if (isDialer) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Paste the pairing code from the person you are helping. It names both their connection
            and the wallet you would be paying to register — you will not be able to pay for any
            other wallet.
          </AlertDescription>
        </Alert>

        {stillAwaitingPartner && (
          <Alert>
            <AlertDescription>
              Waiting for your partner to accept the connection...
            </AlertDescription>
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

  // Registeree / reporter view: publish the pairing code and wait.
  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Send this pairing code to the person paying your gas fees. It identifies you and the
          wallet being registered, so they can confirm they are paying for the right one.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col items-center space-y-4">
        <p className="text-sm text-muted-foreground">Your pairing code (click to copy):</p>
        <PeerIdDisplay peerId={peerId} walletAddress={address} />
        <p className="text-xs text-muted-foreground">Waiting for your relayer to connect...</p>
      </div>
    </div>
  );
}
