/**
 * @swr/p2p - P2P protocol types and validation for SWR relay.
 *
 * Provides protocol definitions, message schemas, and validation utilities
 * shared between web app and relay server. Ensures identical message handling
 * across all P2P participants.
 *
 * @example
 * ```typescript
 * import {
 *   PROTOCOLS,
 *   validateStreamData,
 *   getRelayServers,
 *   type ParsedStreamData,
 * } from '@swr/p2p';
 *
 * // Handle incoming stream
 * const data = await readStream(stream);
 * const validated = validateStreamData(data);
 * if (!validated) {
 *   throw new Error('Invalid stream data');
 * }
 *
 * // Send signature over protocol
 * const message: ParsedStreamData = {
 *   success: true,
 *   signature: {
 *     keyRef: 'AcknowledgementOfRegistry',
 *     chainId: 8453,
 *     address: '0x...',
 *     value: '0x...',
 *     deadline: '1234567890',
 *     nonce: '0',
 *   },
 * };
 * await sendOnProtocol(PROTOCOLS.ACK_SIG, message);
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOLS
// ═══════════════════════════════════════════════════════════════════════════

export { PROTOCOLS, getAllProtocols, isValidProtocol, type ProtocolId } from './protocols';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Zod schemas
  SignatureOverTheWireSchema,
  FormStateOverTheWireSchema,
  RegistrationStateOverTheWireSchema,
  P2PStateOverTheWireSchema,
  TransactionBatchOverTheWireSchema,
  ParsedStreamDataSchema,
  // TypeScript types
  type SignatureOverTheWire,
  type FormStateOverTheWire,
  type RegistrationStateOverTheWire,
  type P2PStateOverTheWire,
  type TransactionBatchOverTheWire,
  type ParsedStreamData,
  // Configuration types
  type RelayConfig,
  RelayConfigurationError,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export {
  MAX_STREAM_SIZE_BYTES,
  DANGEROUS_JSON_KEYS,
  safeJsonParse,
  validateStreamData,
  isWithinSizeLimit,
  extractPeerIdFromMultiaddr,
} from './validation';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export { RELAY_SERVERS, getRelayServers, getRelayPeerIds, type EnvironmentConfig } from './config';

// Re-export Environment type for consumers
export type { Environment } from '@swr/chains';
