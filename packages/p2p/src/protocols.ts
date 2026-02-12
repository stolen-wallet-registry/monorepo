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
