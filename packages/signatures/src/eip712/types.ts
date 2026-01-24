/**
 * EIP-712 type definitions for SWR registries.
 */

import type { Address, Hash } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN WALLET REGISTRY (SWR) TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type hashes from StolenWalletRegistry contract.
 *
 * These are computed as keccak256 of the EIP-712 type string:
 *
 * ACKNOWLEDGEMENT:
 *   keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)")
 *   = 0x5d29f5466c65723821dcc0b8c03d313c167487cda1efe0d5381d304f61bb85d2
 *
 * REGISTRATION:
 *   keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)")
 *   = 0x84a9e85d406e54d479a4c4f1ec22065370770f384a4b1e9f49d3dcf5ab26ad49
 *
 * To verify: cast keccak "AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)"
 */
export const TYPE_HASHES = {
  /** keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)") */
  ACKNOWLEDGEMENT: '0x5d29f5466c65723821dcc0b8c03d313c167487cda1efe0d5381d304f61bb85d2',
  /** keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)") */
  REGISTRATION: '0x84a9e85d406e54d479a4c4f1ec22065370770f384a4b1e9f49d3dcf5ab26ad49',
} as const;

/** EIP-712 type definitions for StolenWalletRegistry */
export const EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Registration: [
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Acknowledgement message for signing */
export interface AcknowledgementMessage {
  owner: Address;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

/** Registration message for signing */
export interface RegistrationMessage {
  owner: Address;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

/** Step enum matching contract (1 = ACK, 2 = REG) */
export const SIGNATURE_STEP = {
  ACKNOWLEDGEMENT: 1,
  REGISTRATION: 2,
} as const;

export type SignatureStep = (typeof SIGNATURE_STEP)[keyof typeof SIGNATURE_STEP];

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN TRANSACTION REGISTRY (STR) TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** EIP-712 type definitions for StolenTransactionRegistry */
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

/** Transaction batch acknowledgement message for signing */
export interface TxAcknowledgementMessage {
  merkleRoot: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

/** Transaction batch registration message for signing */
export interface TxRegistrationMessage {
  merkleRoot: Hash;
  reportedChainId: Hash;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

/** Step enum for transaction registry (1 = ACK, 2 = REG) */
export const TX_SIGNATURE_STEP = {
  ACKNOWLEDGEMENT: 1,
  REGISTRATION: 2,
} as const;

export type TxSignatureStep = (typeof TX_SIGNATURE_STEP)[keyof typeof TX_SIGNATURE_STEP];
