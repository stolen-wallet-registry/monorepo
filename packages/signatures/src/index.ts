/**
 * @swr/signatures - EIP-712 signature utilities for SWR registries.
 *
 * Provides typed data builders and validation utilities for both
 * StolenWalletRegistry and StolenTransactionRegistry signatures.
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
 * const typedData = buildAcknowledgementTypedData(8453, contractAddress, {
 *   owner: '0x...',
 *   forwarder: '0x...',
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
  TX_EIP712_DOMAIN_NAME,
  TX_EIP712_DOMAIN_VERSION,
  getTxEIP712Domain,
} from './eip712/domain';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export {
  STATEMENTS,
  TYPE_HASHES,
  EIP712_TYPES,
  SIGNATURE_STEP,
  TX_EIP712_TYPES,
  TX_SIGNATURE_STEP,
  TX_TYPE_HASHES,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type SignatureStep,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type TxSignatureStep,
} from './eip712/types';

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
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
