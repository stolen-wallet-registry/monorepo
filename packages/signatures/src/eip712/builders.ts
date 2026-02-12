/**
 * EIP-712 typed data builders for SWR registries.
 */

import type { Address, Hash } from 'viem';
import { keccak256, encodeAbiParameters } from 'viem';
import { getEIP712Domain, getSpokeEIP712Domain } from './domain';
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
// WALLET REGISTRY BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build typed data for wallet acknowledgement signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryHub or SpokeRegistry contract address
 * @param isHub - True for FraudRegistryHub (hub), false for SpokeRegistry (spoke)
 * @param message - The acknowledgement message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<AcknowledgementMessage, 'statement'>
) {
  const domain = isHub
    ? getEIP712Domain(chainId, contractAddress)
    : getSpokeEIP712Domain(chainId, contractAddress);

  return {
    domain,
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
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryHub or SpokeRegistry contract address
 * @param isHub - True for FraudRegistryHub (hub), false for SpokeRegistry (spoke)
 * @param message - The registration message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<RegistrationMessage, 'statement'>
) {
  const domain = isHub
    ? getEIP712Domain(chainId, contractAddress)
    : getSpokeEIP712Domain(chainId, contractAddress);

  return {
    domain,
    types: EIP712_TYPES,
    primaryType: 'Registration' as const,
    message: {
      statement: STATEMENTS.WALLET_REG,
      ...message,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION REGISTRY BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build typed data for transaction batch acknowledgement signature.
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryHub or SpokeRegistry contract address
 * @param isHub - True for FraudRegistryHub (hub), false for SpokeRegistry (spoke)
 * @param message - The acknowledgement message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildTxAcknowledgementTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<TxAcknowledgementMessage, 'statement'>
) {
  const domain = isHub
    ? getEIP712Domain(chainId, contractAddress)
    : getSpokeEIP712Domain(chainId, contractAddress);

  return {
    domain,
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
 *
 * @param chainId - The chain ID
 * @param contractAddress - The FraudRegistryHub or SpokeRegistry contract address
 * @param isHub - True for FraudRegistryHub (hub), false for SpokeRegistry (spoke)
 * @param message - The registration message to sign (without statement)
 * @returns Typed data object for signing
 */
export function buildTxRegistrationTypedData(
  chainId: number,
  contractAddress: Address,
  isHub: boolean,
  message: Omit<TxRegistrationMessage, 'statement'>
) {
  const domain = isHub
    ? getEIP712Domain(chainId, contractAddress)
    : getSpokeEIP712Domain(chainId, contractAddress);

  return {
    domain,
    types: TX_EIP712_TYPES,
    primaryType: 'TransactionBatchRegistration' as const,
    message: {
      statement: STATEMENTS.TX_REG,
      ...message,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA HASH COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute transaction data hash for registration.
 * Transactions are stored directly - dataHash is used for signature binding only.
 *
 * The dataHash is computed as: keccak256(abi.encode(txHashes, chainIds))
 * This matches the contract's computation in TransactionRegistry and SpokeRegistry.
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

  // Use abi.encode (not encodePacked) to avoid hash collision risk with dynamic arrays.
  // Matches contract: keccak256(abi.encode(transactionHashes, chainIds))
  return keccak256(
    encodeAbiParameters([{ type: 'bytes32[]' }, { type: 'bytes32[]' }], [txHashes, chainIds])
  );
}
