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
 * controls the wallet address it claims; that needs each side to sign its libp2p peer ID
 * with its wallet key during the handshake, which is a protocol change affecting all four
 * pages and the pairing UX.
 */

import { PROTOCOLS, PROTOCOL_SCHEMAS, type ParsedStreamData } from '@swr/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';
import type { Connection } from './libp2p';

/**
 * Roles that receive inbound streams.
 *
 * Only the gas-paying side (`relayer`) legitimately learns its partner from an inbound
 * CONNECT: it publishes its peer ID and waits. The `registeree` side (and the transaction
 * flow's `reporter`) always dials out first, so by the time any stream arrives it already
 * knows the peer ID it agreed on out of band — it has nothing to learn and must never pin
 * from an inbound CONNECT.
 */
export type StreamRole = 'relayer' | 'registeree';

/**
 * Resolve the remote peer ID for an inbound stream, enforcing partner binding.
 *
 * On CONNECT the partner is pinned if not already known AND the local role is allowed to
 * pin; on every other protocol the remote peer must equal the pinned partner.
 *
 * `mayPin` closes a race in trust-on-first-use: with both sides pinning, whoever CONNECTed
 * first won. An attacker who read the relayer's displayed peer ID could CONNECT to the
 * registeree before the real relayer did, get itself pinned, and lock the legitimate
 * relayer out — or, in the mirror case, substitute the trusted forwarder so the relayer
 * pays gas for a wallet the attacker controls. The registeree can never need to pin,
 * so it never does.
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
    // The registeree already pinned the relayer's peer ID out of band before dialing, so a
    // CONNECT from anyone else is an impostor. The relayer has nothing pinned yet and
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
 * @param role - Local role. `'relayer'` waits to be dialed and may pin an unknown peer from
 *   an inbound CONNECT; `'registeree'` (including the transaction flow's reporter) dials out
 *   and must never pin. Required so every page makes the choice deliberately.
 * @returns true if the handler should process the message
 */
export function acceptStream(
  protocol: string,
  connection: Connection | undefined,
  data: ParsedStreamData,
  role: StreamRole
): connection is Connection {
  if (authorizeStreamPeer(protocol, connection, role === 'relayer') === null) return false;
  return validateProtocolMessage(protocol, data);
}
