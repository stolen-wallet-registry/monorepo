/**
 * EIP-712 typed data builders for SWR registries.
 */

import type { Address } from 'viem';
import { getEIP712Domain, getTxEIP712Domain } from './domain';
import {
  EIP712_TYPES,
  TX_EIP712_TYPES,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN WALLET REGISTRY (SWR) BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build typed data for wallet acknowledgement signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenWalletRegistry contract address
 * @param message - The acknowledgement message to sign
 * @returns Typed data object for signing
 */
export function buildAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  message: AcknowledgementMessage
) {
  return {
    domain: getEIP712Domain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'AcknowledgementOfRegistry' as const,
    message,
  };
}

/**
 * Build typed data for wallet registration signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenWalletRegistry contract address
 * @param message - The registration message to sign
 * @returns Typed data object for signing
 */
export function buildRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  message: RegistrationMessage
) {
  return {
    domain: getEIP712Domain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'Registration' as const,
    message,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN TRANSACTION REGISTRY (STR) BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build typed data for transaction batch acknowledgement signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenTransactionRegistry contract address
 * @param message - The acknowledgement message to sign
 * @returns Typed data object for signing
 */
export function buildTxAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  message: TxAcknowledgementMessage
) {
  return {
    domain: getTxEIP712Domain(chainId, contractAddress),
    types: TX_EIP712_TYPES,
    primaryType: 'TransactionBatchAcknowledgement' as const,
    message: {
      ...message,
      // Ensure transactionCount is a number for EIP-712 encoding
      transactionCount: message.transactionCount,
    },
  };
}

/**
 * Build typed data for transaction batch registration signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenTransactionRegistry contract address
 * @param message - The registration message to sign
 * @returns Typed data object for signing
 */
export function buildTxRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  message: TxRegistrationMessage
) {
  return {
    domain: getTxEIP712Domain(chainId, contractAddress),
    types: TX_EIP712_TYPES,
    primaryType: 'TransactionBatchRegistration' as const,
    message,
  };
}
