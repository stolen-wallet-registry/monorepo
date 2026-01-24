/**
 * EIP-712 typed data builders for SWR registries.
 */

import type { Address } from 'viem';
import { getEIP712Domain, getTxEIP712Domain } from './domain';
import {
  EIP712_TYPES,
  TX_EIP712_TYPES,
  STATEMENTS,
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
 * The statement is added internally to ensure consistency with the contract.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenWalletRegistry contract address
 * @param message - The acknowledgement message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  message: Omit<AcknowledgementMessage, 'statement'>
) {
  return {
    domain: getEIP712Domain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'AcknowledgementOfRegistry' as const,
    message: {
      statement: STATEMENTS.WALLET_ACK,
      ...message,
    },
  };
}

/**
 * Build typed data for wallet registration signature.
 * The statement is added internally to ensure consistency with the contract.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenWalletRegistry contract address
 * @param message - The registration message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  message: Omit<RegistrationMessage, 'statement'>
) {
  return {
    domain: getEIP712Domain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'Registration' as const,
    message: {
      statement: STATEMENTS.WALLET_REG,
      ...message,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN TRANSACTION REGISTRY (STR) BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build typed data for transaction batch acknowledgement signature.
 * The statement is added internally to ensure consistency with the contract.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenTransactionRegistry contract address
 * @param message - The acknowledgement message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildTxAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  message: Omit<TxAcknowledgementMessage, 'statement'>
) {
  return {
    domain: getTxEIP712Domain(chainId, contractAddress),
    types: TX_EIP712_TYPES,
    primaryType: 'TransactionBatchAcknowledgement' as const,
    message: {
      statement: STATEMENTS.TX_ACK,
      ...message,
    },
  };
}

/**
 * Build typed data for transaction batch registration signature.
 * The statement is added internally to ensure consistency with the contract.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The StolenTransactionRegistry contract address
 * @param message - The registration message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildTxRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  message: Omit<TxRegistrationMessage, 'statement'>
) {
  return {
    domain: getTxEIP712Domain(chainId, contractAddress),
    types: TX_EIP712_TYPES,
    primaryType: 'TransactionBatchRegistration' as const,
    message: {
      statement: STATEMENTS.TX_REG,
      ...message,
    },
  };
}
