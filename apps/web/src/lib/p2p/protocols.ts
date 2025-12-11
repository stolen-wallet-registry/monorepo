/**
 * SWR P2P Protocol definitions.
 *
 * Custom protocols for Stolen Wallet Registry peer-to-peer communication.
 * Used for relaying signatures between registeree and relayer peers.
 */

/**
 * Protocol identifiers for SWR P2P communication.
 */
export const PROTOCOLS = {
  /** Initial connection handshake */
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
  REG_REC: '/swr/register/signature/received/1.0.0',
  /** Registration payment notification (relayer → registeree) */
  REG_PAY: '/swr/register/payment/1.0.0',
} as const;

export type ProtocolId = (typeof PROTOCOLS)[keyof typeof PROTOCOLS];

/**
 * Get all protocol IDs as an array.
 */
export function getAllProtocols(): ProtocolId[] {
  return Object.values(PROTOCOLS);
}

/**
 * Check if a string is a valid SWR protocol.
 */
export function isSwrProtocol(protocol: string): protocol is ProtocolId {
  return Object.values(PROTOCOLS).includes(protocol as ProtocolId);
}
