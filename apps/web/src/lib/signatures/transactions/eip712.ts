// EIP-712 typed data definitions for StolenTransactionRegistry
// Matches contract: StolenTransactionRegistry.sol version 4

import type { TypedDataDomain } from 'viem';
import type { Address, Hash } from '@/lib/types/ethereum';

// EIP-712 Domain configuration
export const TX_EIP712_DOMAIN_NAME = 'StolenTransactionRegistry';
export const TX_EIP712_DOMAIN_VERSION = '4';

// EIP-712 type definitions for transaction batch registration
export const TX_EIP712_TYPES = {
  TransactionBatchAcknowledgement: [
    { name: 'merkleRoot', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TransactionBatchRegistration: [
    { name: 'merkleRoot', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

// Get EIP-712 domain for a specific chain and contract
export function getTxEIP712Domain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: TX_EIP712_DOMAIN_NAME,
    version: TX_EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

// Message types for signing
export interface TxAcknowledgementMessage {
  merkleRoot: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

export interface TxRegistrationMessage {
  merkleRoot: Hash;
  reportedChainId: Hash;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

// Step enum matching contract (1 = ACK, 2 = REG)
export const TX_SIGNATURE_STEP = {
  ACKNOWLEDGEMENT: 1,
  REGISTRATION: 2,
} as const;

export type TxSignatureStep = (typeof TX_SIGNATURE_STEP)[keyof typeof TX_SIGNATURE_STEP];

// Build typed data for transaction acknowledgement signature
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

// Build typed data for transaction registration signature
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
