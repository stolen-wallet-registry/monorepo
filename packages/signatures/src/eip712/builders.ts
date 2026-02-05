/**
 * EIP-712 typed data builders for SWR registries.
 */

import type { Address, Hash } from 'viem';
import { keccak256, encodePacked } from 'viem';
import {
  getEIP712Domain,
  getTxEIP712Domain,
  getV2EIP712Domain,
  getSpokeV2EIP712Domain,
} from './domain';
import {
  EIP712_TYPES,
  TX_EIP712_TYPES,
  STATEMENTS,
  V2_EIP712_TYPES,
  V2_TX_EIP712_TYPES,
  V2_STATEMENTS,
  type AcknowledgementMessage,
  type RegistrationMessage,
  type TxAcknowledgementMessage,
  type TxRegistrationMessage,
  type V2AcknowledgementMessage,
  type V2RegistrationMessage,
  type V2TxAcknowledgementMessage,
  type V2TxRegistrationMessage,
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

// ═══════════════════════════════════════════════════════════════════════════
// V2 FRAUD REGISTRY BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build V2 typed data for wallet acknowledgement signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryV2 or SpokeRegistryV2 contract address
 * @param isHub - True for FraudRegistryV2 (hub), false for SpokeRegistryV2 (spoke)
 * @param message - The acknowledgement message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildV2AcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<V2AcknowledgementMessage, 'statement'>
) {
  const domain = isHub
    ? getV2EIP712Domain(chainId, contractAddress)
    : getSpokeV2EIP712Domain(chainId, contractAddress);

  return {
    domain,
    types: V2_EIP712_TYPES,
    primaryType: 'AcknowledgementOfRegistry' as const,
    message: {
      statement: V2_STATEMENTS.WALLET_ACK,
      ...message,
    },
  };
}

/**
 * Build V2 typed data for wallet registration signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryV2 or SpokeRegistryV2 contract address
 * @param isHub - True for FraudRegistryV2 (hub), false for SpokeRegistryV2 (spoke)
 * @param message - The registration message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildV2RegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<V2RegistrationMessage, 'statement'>
) {
  const domain = isHub
    ? getV2EIP712Domain(chainId, contractAddress)
    : getSpokeV2EIP712Domain(chainId, contractAddress);

  return {
    domain,
    types: V2_EIP712_TYPES,
    primaryType: 'Registration' as const,
    message: {
      statement: V2_STATEMENTS.WALLET_REG,
      ...message,
    },
  };
}

/**
 * Build V2 typed data for transaction batch acknowledgement signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryV2 or SpokeRegistryV2 contract address
 * @param isHub - True for FraudRegistryV2 (hub), false for SpokeRegistryV2 (spoke)
 * @param message - The acknowledgement message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildV2TxAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<V2TxAcknowledgementMessage, 'statement'>
) {
  const domain = isHub
    ? getV2EIP712Domain(chainId, contractAddress)
    : getSpokeV2EIP712Domain(chainId, contractAddress);

  return {
    domain,
    types: V2_TX_EIP712_TYPES,
    primaryType: 'TransactionBatchAcknowledgement' as const,
    message: {
      statement: V2_STATEMENTS.TX_ACK,
      ...message,
    },
  };
}

/**
 * Build V2 typed data for transaction batch registration signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryV2 or SpokeRegistryV2 contract address
 * @param isHub - True for FraudRegistryV2 (hub), false for SpokeRegistryV2 (spoke)
 * @param message - The registration message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildV2TxRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<V2TxRegistrationMessage, 'statement'>
) {
  const domain = isHub
    ? getV2EIP712Domain(chainId, contractAddress)
    : getSpokeV2EIP712Domain(chainId, contractAddress);

  return {
    domain,
    types: V2_TX_EIP712_TYPES,
    primaryType: 'TransactionBatchRegistration' as const,
    message: {
      statement: V2_STATEMENTS.TX_REG,
      ...message,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 DATA HASH COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute transaction data hash for V2 registration.
 * V2 stores transactions directly - dataHash is used for signature binding only.
 *
 * The dataHash is computed as: keccak256(abi.encodePacked(txHashes, chainIds))
 * This matches the contract's computation in FraudRegistryV2 and SpokeRegistryV2.
 *
 * @param txHashes - Array of transaction hashes (bytes32)
 * @param chainIds - Array of CAIP-2 chain ID hashes (bytes32), same length as txHashes
 * @returns The computed data hash
 * @throws If txHashes and chainIds have different lengths
 */
export function computeTransactionDataHash(txHashes: Hash[], chainIds: Hash[]): Hash {
  if (txHashes.length !== chainIds.length) {
    throw new Error('txHashes and chainIds must have same length');
  }

  if (txHashes.length === 0) {
    throw new Error('Cannot compute data hash for empty arrays');
  }

  // Pack txHashes first, then chainIds (matches contract)
  // encodePacked creates: txHash1 | txHash2 | ... | chainId1 | chainId2 | ...
  return keccak256(
    encodePacked(
      [...txHashes.map(() => 'bytes32' as const), ...chainIds.map(() => 'bytes32' as const)],
      [...txHashes, ...chainIds]
    )
  );
}
