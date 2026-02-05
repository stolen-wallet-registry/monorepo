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
  // V1 (deprecated)
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  getEIP712Domain,
  TX_EIP712_DOMAIN_NAME,
  TX_EIP712_DOMAIN_VERSION,
  getTxEIP712Domain,
  // V2 (primary)
  V2_EIP712_DOMAIN_NAME,
  V2_EIP712_DOMAIN_VERSION,
  SPOKE_V2_EIP712_DOMAIN_NAME,
  getV2EIP712Domain,
  getSpokeV2EIP712Domain,
} from './eip712/domain';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export {
  // V1 (deprecated)
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
  // V2 (primary)
  V2_STATEMENTS,
  V2_EIP712_TYPES,
  V2_TX_EIP712_TYPES,
  type V2AcknowledgementMessage,
  type V2RegistrationMessage,
  type V2TxAcknowledgementMessage,
  type V2TxRegistrationMessage,
  type WalletRegistrationArgs,
} from './eip712/types';

// ═══════════════════════════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

export {
  // V1 (deprecated)
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  // V2 (primary)
  buildV2AcknowledgementTypedData,
  buildV2RegistrationTypedData,
  buildV2TxAcknowledgementTypedData,
  buildV2TxRegistrationTypedData,
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
