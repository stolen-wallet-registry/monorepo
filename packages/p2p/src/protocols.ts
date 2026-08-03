/**
 * SWR P2P Protocol definitions.
 *
 * Custom protocols for Stolen Wallet Registry peer-to-peer communication.
 * Used for relaying signatures between registeree and relayer peers.
 */

/**
 * Protocol identifiers for SWR P2P communication.
 *
 * Naming convention: /swr/{action}/{type}/{version}[/received]
 * - Version always comes before /received suffix for consistency
 */
export const PROTOCOLS = {
  // ── Wallet Registration ──────────────────────────────────────────────
  /** Initial connection handshake (shared across wallet and transaction flows) */
  CONNECT: '/swr/connected/1.0.0',
  /** Acknowledgement signature transfer (registeree → relayer) */
  ACK_SIG: '/swr/acknowledgement/signature/1.0.0',
  /** Acknowledgement signature received confirmation (relayer → registeree) */
  ACK_REC: '/swr/acknowledgement/signature/1.0.0/received',
  /** Acknowledgement payment notification (relayer → registeree) */
  ACK_PAY: '/swr/acknowledgement/payment/1.0.0',
  /** Registration signature transfer (registeree → relayer) */
  REG_SIG: '/swr/register/signature/1.0.0',
  /** Registration signature received confirmation (relayer → registeree) */
  REG_REC: '/swr/register/signature/1.0.0/received',
  /** Registration payment notification (relayer → registeree) */
  REG_PAY: '/swr/register/payment/1.0.0',

  // ── Recovery ─────────────────────────────────────────────────────────
  /**
   * Re-sign request (relayer → registeree/reporter), shared by both flows.
   *
   * Sent when a relayed signature is invalidated by an on-chain revert. The relayer holds a
   * copy it can delete but cannot replace — only the party being helped can sign again — so
   * the request travels back over the wire. Deliberately flow-agnostic: the receiver derives
   * everything actionable from its own step machine, never from the message.
   */
  RESIGN_REQ: '/swr/resign-request/1.0.0',
  /**
   * Re-sign acknowledgement (registeree/reporter → relayer), the reply to {@link RESIGN_REQ}.
   *
   * A stream write that a peer silently drops still resolves — this codebase established that
   * for CONNECT — so `RESIGN_REQ` returning true proved only that the bytes left. The receiver
   * has explicit refusal paths (its re-sign budget is spent, or a poll already moved its
   * step), and without a reply both sides waited forever: the relayer on a signature nobody
   * was going to send, the receiver on a request it had already dropped.
   *
   * So the receiver answers every request, refusals included, and the relayer moves only once
   * the answer arrives. `success` carries the whole decision — `true` means the receiver is
   * going back to a sign step, `false` means it refused. Any `message` is prose for the LOG:
   * it is peer-supplied and must never be rendered to a victim mid-flow, which is why the
   * schema below is the plain confirmation shape and carries nothing the receiver acts on.
   */
  RESIGN_ACK: '/swr/resign-ack/1.0.0',

  // ── Transaction Registration ─────────────────────────────────────────
  /** Transaction acknowledgement signature + batch data (reporter → relayer) */
  TX_ACK_SIG: '/swr/tx-acknowledgement/signature/1.0.0',
  /** Transaction acknowledgement received confirmation (relayer → reporter) */
  TX_ACK_REC: '/swr/tx-acknowledgement/signature/1.0.0/received',
  /** Transaction acknowledgement payment notification (relayer → reporter) */
  TX_ACK_PAY: '/swr/tx-acknowledgement/payment/1.0.0',
  /** Transaction registration signature + batch data (reporter → relayer) */
  TX_REG_SIG: '/swr/tx-register/signature/1.0.0',
  /** Transaction registration received confirmation (relayer → reporter) */
  TX_REG_REC: '/swr/tx-register/signature/1.0.0/received',
  /** Transaction registration payment notification (relayer → reporter) */
  TX_REG_PAY: '/swr/tx-register/payment/1.0.0',
} as const;

export type ProtocolId = (typeof PROTOCOLS)[keyof typeof PROTOCOLS];

/**
 * Get all protocol IDs as an array (useful for handler registration).
 */
export function getAllProtocols(): ProtocolId[] {
  return Object.values(PROTOCOLS);
}

/**
 * Check if a string is a valid SWR protocol ID.
 */
export function isValidProtocol(protocol: string): protocol is ProtocolId {
  return Object.values(PROTOCOLS).includes(protocol as ProtocolId);
}
