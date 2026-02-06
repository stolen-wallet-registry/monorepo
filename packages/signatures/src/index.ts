/**
 * @swr/signatures - EIP-712 signature utilities for SWR registries.
 *
 * Provides typed data builders and validation utilities for both
 * WalletRegistry and TransactionRegistry signatures.
 * Used by web app, relay, and CLI to ensure consistent signing.
 *
 * @example
 * ```typescript
 * import {
 *   buildAcknowledgementTypedData,
 *   buildRegistrationTypedData,
 *   parseSignature,
 *   isValidSignatureFormat,
 * } from '@swr/signatures';
 *
 * // Build typed data for wallet registration
 * const typedData = buildAcknowledgementTypedData(8453, contractAddress, true, {
 *   wallet: '0x...',
 *   forwarder: '0x...',
 *   reportedChainId: 8453n,
 *   incidentTimestamp: 1234567890n,
 *   nonce: 0n,
 *   deadline: 1234567890n,
 * });
 *
 * // Sign with wallet
 * const signature = await signTypedData(typedData);
 *
 * // Parse for contract call
 * const { v, r, s } = parseSignature(signature);
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN
// ═══════════════════════════════════════════════════════════════════════════

export {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  getEIP712Domain,
  getSpokeEIP712Domain,
} from './eip712/domain';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export {
  STATEMENTS,
  EIP712_TYPES,
  SIGNATURE_STEP,
  TX_EIP712_TYPES,
  TX_SIGNATURE_STEP,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type SignatureStep,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type TxSignatureStep,
  type WalletAcknowledgeArgs,
  type WalletRegistrationArgs,
} from './eip712/types';

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  computeTransactionDataHash,
} from './eip712/builders';

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export {
  parseSignature,
  isSignatureExpired,
  isWithinRegistrationWindow,
  getStepName,
  isValidSignatureFormat,
  STEP_NAMES,
  type ParsedSignature,
} from './validation';
