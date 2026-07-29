import { describe, it, expect, beforeEach } from 'vitest';
import { PROTOCOLS, type ParsedStreamData } from '@swr/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { authorizeStreamPeer, validateProtocolMessage, acceptStream } from './peerGuard';
import type { Connection } from './libp2p';

const PARTNER = '12D3KooWPartnerPeerIdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ATTACKER = '12D3KooWAttackerPeerIdBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

/** Minimal stand-in for a libp2p Connection: the guard only reads remotePeer. */
function conn(peerId: string): Connection {
  return { remotePeer: { toString: () => peerId } } as unknown as Connection;
}

const handshake: ParsedStreamData = { success: true, form: { relayer: `0x${'a'.repeat(40)}` } };

const signatureMessage: ParsedStreamData = {
  signature: {
    keyRef: 'AcknowledgementOfRegistry',
    chainId: 8453,
    address: `0x${'a'.repeat(40)}`,
    value: `0x${'b'.repeat(130)}`,
    deadline: '1700000000',
    nonce: '0',
  },
};

beforeEach(() => {
  useP2PStore.setState({ partnerPeerId: null });
});

describe('authorizeStreamPeer', () => {
  it('pins the partner from the connection on first CONNECT when the role may pin', () => {
    expect(authorizeStreamPeer(PROTOCOLS.CONNECT, conn(PARTNER), true)).toBe(PARTNER);
    expect(useP2PStore.getState().partnerPeerId).toBe(PARTNER);
  });

  // The TOFU race: with both sides pinning, whoever CONNECTed first won. An attacker who
  // read the relayer's displayed peer ID could CONNECT to the registeree before the real
  // relayer did and be adopted as the partner. The registeree always dials out first and
  // therefore already knows its partner, so it must never adopt one from an inbound stream.
  it('rejects an inbound CONNECT from an unknown peer when the role may not pin', () => {
    expect(authorizeStreamPeer(PROTOCOLS.CONNECT, conn(ATTACKER), false)).toBeNull();
    expect(useP2PStore.getState().partnerPeerId).toBeNull();
  });

  it('defaults to not pinning when the flag is omitted', () => {
    expect(authorizeStreamPeer(PROTOCOLS.CONNECT, conn(ATTACKER))).toBeNull();
    expect(useP2PStore.getState().partnerPeerId).toBeNull();
  });

  // Positive path for the non-pinning role: once it has pinned its partner itself (at dial
  // time), the partner's CONNECT reply is accepted normally.
  it('accepts the pinned partner CONNECT even when the role may not pin', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(authorizeStreamPeer(PROTOCOLS.CONNECT, conn(PARTNER), false)).toBe(PARTNER);
    expect(useP2PStore.getState().partnerPeerId).toBe(PARTNER);
  });

  // The registeree pins the relayer's peer ID out of band before dialing, so a CONNECT
  // arriving from anyone else is an impostor racing the real relayer.
  it('rejects CONNECT from a peer other than the already-pinned partner', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(authorizeStreamPeer(PROTOCOLS.CONNECT, conn(ATTACKER), true)).toBeNull();
    expect(useP2PStore.getState().partnerPeerId).toBe(PARTNER);
  });

  it('accepts subsequent protocols from the bound partner', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(authorizeStreamPeer(PROTOCOLS.ACK_SIG, conn(PARTNER))).toBe(PARTNER);
    expect(authorizeStreamPeer(PROTOCOLS.REG_PAY, conn(PARTNER))).toBe(PARTNER);
  });

  // The core of the finding: peer IDs are displayed in the UI and travel through a public
  // relay, so anyone who learns one could previously dial in and inject a signature.
  it('rejects every non-CONNECT protocol from an unbound peer', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    for (const protocol of [
      PROTOCOLS.ACK_SIG,
      PROTOCOLS.ACK_REC,
      PROTOCOLS.ACK_PAY,
      PROTOCOLS.REG_SIG,
      PROTOCOLS.REG_REC,
      PROTOCOLS.REG_PAY,
      PROTOCOLS.TX_ACK_SIG,
      PROTOCOLS.TX_REG_SIG,
    ]) {
      expect(authorizeStreamPeer(protocol, conn(ATTACKER))).toBeNull();
    }
  });

  it('rejects streams that arrive before any partner is established', () => {
    expect(authorizeStreamPeer(PROTOCOLS.ACK_SIG, conn(PARTNER))).toBeNull();
  });

  it('rejects a stream with no connection to attribute it to', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(authorizeStreamPeer(PROTOCOLS.ACK_SIG, undefined)).toBeNull();
  });
});

describe('validateProtocolMessage', () => {
  it('accepts a message matching its protocol schema', () => {
    expect(validateProtocolMessage(PROTOCOLS.ACK_SIG, signatureMessage)).toBe(true);
    expect(validateProtocolMessage(PROTOCOLS.CONNECT, handshake)).toBe(true);
  });

  // readStreamData validates against the union of every protocol's shape, so without this
  // narrowing a confirmation message could smuggle a signature field through.
  it('rejects a message valid for a different protocol', () => {
    expect(validateProtocolMessage(PROTOCOLS.ACK_REC, signatureMessage)).toBe(false);
  });

  it('rejects a signature protocol carrying no signature', () => {
    expect(validateProtocolMessage(PROTOCOLS.ACK_SIG, { success: true })).toBe(false);
  });

  it('rejects an unknown protocol rather than defaulting to accept', () => {
    expect(validateProtocolMessage('/swr/not-a-protocol/1.0.0', handshake)).toBe(false);
  });
});

describe('acceptStream', () => {
  it('accepts a schema-valid message from the bound partner', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(acceptStream(PROTOCOLS.ACK_SIG, conn(PARTNER), signatureMessage, 'relayer')).toBe(true);
    expect(acceptStream(PROTOCOLS.ACK_SIG, conn(PARTNER), signatureMessage, 'registeree')).toBe(
      true
    );
  });

  it('rejects a schema-valid message from an unbound peer', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(acceptStream(PROTOCOLS.ACK_SIG, conn(ATTACKER), signatureMessage, 'relayer')).toBe(
      false
    );
  });

  it('rejects a schema-invalid message from the bound partner', () => {
    useP2PStore.setState({ partnerPeerId: PARTNER });

    expect(acceptStream(PROTOCOLS.ACK_SIG, conn(PARTNER), { success: true }, 'relayer')).toBe(
      false
    );
  });

  // Role wiring: the relayer waits to be dialed and learns its partner from the inbound
  // CONNECT; the registeree/reporter dials out and must not.
  it('lets only the relayer role adopt a partner from an inbound CONNECT', () => {
    expect(acceptStream(PROTOCOLS.CONNECT, conn(ATTACKER), handshake, 'registeree')).toBe(false);
    expect(useP2PStore.getState().partnerPeerId).toBeNull();

    expect(acceptStream(PROTOCOLS.CONNECT, conn(PARTNER), handshake, 'relayer')).toBe(true);
    expect(useP2PStore.getState().partnerPeerId).toBe(PARTNER);
  });
});
