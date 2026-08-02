/**
 * Peer binding for inbound P2P streams.
 *
 * Every protocol handler in the four P2P pages used to accept whatever arrived on the
 * stream, taking both the counterparty wallet address and the partner peer ID from the
 * message payload and discarding the libp2p `Connection` entirely. Peer IDs are displayed
 * in the UI and pass through a public relay, so anyone who learned one could dial in and
 * inject signatures, substitute the trusted forwarder, or drive the victim's step machine.
 *
 * The rule enforced here: the partner peer is pinned once, from `connection.remotePeer` —
 * never from the payload — and every later stream must come from that same peer.
 *
 * This is connection-level binding only. It does not prove that the peer on the other end
 * controls the wallet address it claims. That is handled elsewhere and differently: the
 * relayer learns the wallet out of band from the pairing token (`lib/p2p/pairingToken.ts`)
 * and refuses to pay unless the signer recovered from the EIP-712 digest is that wallet — an
 * authorization check, which a peer-ID↔wallet signing handshake could not have provided,
 * since an attacker naming its own wallet passes any such challenge.
 */

import { PROTOCOLS, PROTOCOL_SCHEMAS, type ParsedStreamData } from '@swr/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';
import type { Connection } from './libp2p';

/**
 * Roles that receive inbound streams.
 *
 * Which side may adopt a partner from an inbound CONNECT follows from who dials, and that
 * flipped when pairing moved to the token (audit V4): the party being helped now publishes a
 * pairing token and waits, and the gas-paying `relayer` pastes it and dials. So the `relayer`
 * already knows the peer ID it agreed on out of band — it pins before it speaks and must
 * never adopt one from an inbound stream — while `registeree` (and the transaction flow's
 * reporter) learns its partner from the CONNECT that arrives.
 *
 * The residual trust-on-first-use race therefore sits on the `registeree` side now, and it is
 * a deliberately cheaper one to lose: someone who intercepts the pairing token can dial first
 * and be adopted as the helper, but everything they can then do is pay to register the
 * victim's own wallet (the victim's goal) or stall and pay nothing. The race that was worth
 * closing was the one on the relayer side, where losing it meant paying to permanently mark a
 * wallet chosen by the attacker.
 */
export type StreamRole = 'relayer' | 'registeree';

/**
 * Resolve the remote peer ID for an inbound stream, enforcing partner binding.
 *
 * On CONNECT the partner is pinned if not already known AND the local role is allowed to
 * pin; on every other protocol the remote peer must equal the pinned partner.
 *
 * `mayPin` closes a race in trust-on-first-use: with both sides pinning, whoever CONNECTed
 * first won, and on the relayer's side losing that race meant paying gas to register a wallet
 * the attacker controls. The relayer now pins from the pairing token before dialing, so it
 * never needs to adopt an unknown peer and never does.
 *
 * @param protocol - Protocol the stream arrived on
 * @param connection - libp2p connection the stream belongs to
 * @param mayPin - Whether the local role may adopt an unknown peer as its partner
 * @returns the authorized remote peer ID, or null if the stream must be dropped
 */
export function authorizeStreamPeer(
  protocol: string,
  connection: Connection | undefined,
  mayPin: boolean = false
): string | null {
  // Without a connection there is nothing to bind against. libp2p always supplies one;
  // treat its absence as a failure rather than silently accepting an unattributable stream.
  if (!connection) {
    logger.p2p.error('Rejected stream with no connection: cannot verify remote peer', {
      protocol,
    });
    return null;
  }

  const remotePeerId = connection.remotePeer.toString();
  const { partnerPeerId, setPartnerPeerId } = useP2PStore.getState();

  if (protocol === PROTOCOLS.CONNECT) {
    // The relayer already pinned the peer ID from the pairing token before dialing, so a
    // CONNECT from anyone else is an impostor. The registeree has nothing pinned yet and
    // learns its partner here — from the connection, not from data.p2p.peerId.
    if (partnerPeerId && partnerPeerId !== remotePeerId) {
      logger.p2p.warn('Rejected CONNECT from a peer that is not the agreed partner', {
        protocol,
        remotePeerId,
        partnerPeerId,
      });
      return null;
    }

    if (!partnerPeerId) {
      if (!mayPin) {
        // The dialing side already knows who it agreed to talk to. An inbound CONNECT from
        // an unknown peer here is not a partner discovering us, it is a stranger.
        logger.p2p.warn(
          'Rejected CONNECT: this role never adopts a partner from an inbound stream',
          {
            protocol,
            remotePeerId,
          }
        );
        return null;
      }
      logger.p2p.info('Pinned partner peer from connection', { remotePeerId });
      setPartnerPeerId(remotePeerId);
    }

    return remotePeerId;
  }

  if (!partnerPeerId) {
    logger.p2p.warn('Rejected stream received before any partner was established', {
      protocol,
      remotePeerId,
    });
    return null;
  }

  if (partnerPeerId !== remotePeerId) {
    logger.p2p.warn('Rejected stream from a peer that is not the bound partner', {
      protocol,
      remotePeerId,
      partnerPeerId,
    });
    return null;
  }

  return remotePeerId;
}

/**
 * Validate a decoded message against the schema for its protocol.
 *
 * `readStreamData` validates against `ParsedStreamDataSchema`, the union of everything any
 * protocol may send. That accepts, for example, a payment notification carrying a signature
 * field. `PROTOCOL_SCHEMAS` narrows to what the specific protocol is allowed to contain.
 *
 * @returns true if the message is valid for this protocol
 */
export function validateProtocolMessage(protocol: string, data: ParsedStreamData): boolean {
  const schema = PROTOCOL_SCHEMAS[protocol];
  if (!schema) {
    logger.p2p.warn('No schema registered for protocol', { protocol });
    return false;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    logger.p2p.warn('Rejected message that does not match its protocol schema', {
      protocol,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return false;
  }

  return true;
}

/**
 * Combined gate for an inbound stream: the peer must be the bound partner, and the message
 * must match the schema for the protocol it arrived on.
 *
 * Narrows `connection` for the caller: a stream with no connection is always rejected, so
 * past this gate the handler can rely on having one to reply over.
 *
 * @param role - Local role. `'registeree'` (including the transaction flow's reporter) waits
 *   to be dialed and may pin an unknown peer from an inbound CONNECT; `'relayer'` pastes the
 *   pairing token, pins from it and dials, so it must never pin from a stream. Required so
 *   every page makes the choice deliberately.
 * @returns true if the handler should process the message
 */
export function acceptStream(
  protocol: string,
  connection: Connection | undefined,
  data: ParsedStreamData,
  role: StreamRole
): connection is Connection {
  if (authorizeStreamPeer(protocol, connection, role === 'registeree') === null) return false;
  if (!validateProtocolMessage(protocol, data)) return false;

  // Liveness is recorded here rather than at parse time: a well-formed message from a
  // stranger proves nothing about the partner, and recording it there would let anyone on
  // the public relay paper over a keep-alive failure that correctly reported the partner
  // lost. Past this point the sender IS the bound partner, so the traffic is real evidence.
  useP2PStore.getState().setConnectedToPeer(true);

  return true;
}
