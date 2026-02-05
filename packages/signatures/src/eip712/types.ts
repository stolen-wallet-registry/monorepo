/**
 * EIP-712 type definitions for SWR registries.
 */

import type { Address, Hash } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// STATEMENT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Human-readable statements displayed in wallet signing UI (e.g., MetaMask).
 * These MUST match the contract constants exactly.
 */
export const STATEMENTS = {
  /** Statement for wallet acknowledgement */
  WALLET_ACK:
    'This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.',
  /** Statement for wallet registration */
  WALLET_REG:
    'This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.',
  /** Statement for transaction batch acknowledgement */
  TX_ACK:
    'This signature acknowledges that the specified transactions are being reported as fraudulent to the Stolen Transaction Registry.',
  /** Statement for transaction batch registration */
  TX_REG:
    'This signature confirms permanent registration of the specified transactions as fraudulent. This action is irreversible.',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// STOLEN WALLET REGISTRY (SWR) TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type hashes from StolenWalletRegistry contract.
 *
 * These are computed as keccak256 of the EIP-712 type string:
 *
 * ACKNOWLEDGEMENT:
 *   keccak256("AcknowledgementOfRegistry(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)")
 *   = 0x90eeb72d8a1205a6b9dfe0b0de8f84e7bf029efa82f52150fc7d1d0b4ac78afe
 *
 * REGISTRATION:
 *   keccak256("Registration(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)")
 *   = 0xb00aa26a5433ee38293a5739b11c6e3d78bdf35aab2e0cdc7b7039588e8ecf3d
 *
 * To verify: cast keccak "AcknowledgementOfRegistry(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)"
 */
export const TYPE_HASHES = {
  /** keccak256("AcknowledgementOfRegistry(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)") */
  ACKNOWLEDGEMENT: '0x90eeb72d8a1205a6b9dfe0b0de8f84e7bf029efa82f52150fc7d1d0b4ac78afe',
  /** keccak256("Registration(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)") */
  REGISTRATION: '0xb00aa26a5433ee38293a5739b11c6e3d78bdf35aab2e0cdc7b7039588e8ecf3d',
} as const;

/** EIP-712 type definitions for StolenWalletRegistry (statement first for visibility in wallet UI) */
export const EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'statement', type: 'string' },
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Registration: [
    { name: 'statement', type: 'string' },
    { name: 'owner', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Acknowledgement message for signing (statement added internally by builders) */
export interface AcknowledgementMessage {
  statement: string;
  owner: Address;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

/** Registration message for signing (statement added internally by builders) */
export interface RegistrationMessage {
  statement: string;
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

/** EIP-712 type definitions for StolenTransactionRegistry (statement first for visibility in wallet UI) */
export const TX_EIP712_TYPES = {
  TransactionBatchAcknowledgement: [
    { name: 'statement', type: 'string' },
    { name: 'merkleRoot', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TransactionBatchRegistration: [
    { name: 'statement', type: 'string' },
    { name: 'merkleRoot', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'forwarder', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Transaction batch acknowledgement message for signing (statement added internally by builders) */
export interface TxAcknowledgementMessage {
  statement: string;
  merkleRoot: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  forwarder: Address;
  nonce: bigint;
  deadline: bigint;
}

/** Transaction batch registration message for signing (statement added internally by builders) */
export interface TxRegistrationMessage {
  statement: string;
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

/**
 * Type hashes from StolenTransactionRegistry contract.
 *
 * These are computed as keccak256 of the EIP-712 type string:
 *
 * TX_ACKNOWLEDGEMENT:
 *   keccak256("TransactionBatchAcknowledgement(string statement,bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)")
 *   = 0x03f062a2bb608a7ec22298ed4c970966e3f0a71772e9c972ad67fbfcde73c1ad
 *
 * TX_REGISTRATION:
 *   keccak256("TransactionBatchRegistration(string statement,bytes32 merkleRoot,bytes32 reportedChainId,address forwarder,uint256 nonce,uint256 deadline)")
 *   = 0x62b458666e887aab1291fd03a9031360c4b516e964aaec31b549b94dc062d988
 *
 * To verify: cast keccak "TransactionBatchAcknowledgement(string statement,bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)"
 */
export const TX_TYPE_HASHES = {
  /** keccak256("TransactionBatchAcknowledgement(string statement,bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)") */
  TX_ACKNOWLEDGEMENT: '0x03f062a2bb608a7ec22298ed4c970966e3f0a71772e9c972ad67fbfcde73c1ad',
  /** keccak256("TransactionBatchRegistration(string statement,bytes32 merkleRoot,bytes32 reportedChainId,address forwarder,uint256 nonce,uint256 deadline)") */
  TX_REGISTRATION: '0x62b458666e887aab1291fd03a9031360c4b516e964aaec31b549b94dc062d988',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// V2 FRAUD REGISTRY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * V2 statement strings displayed in wallet signing UI (e.g., MetaMask).
 * These MUST match the contract constants in EIP712ConstantsV2.sol exactly.
 */
export const V2_STATEMENTS = {
  /** Statement for wallet acknowledgement (V2) */
  WALLET_ACK:
    'This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.',
  /** Statement for wallet registration (V2) */
  WALLET_REG:
    'This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.',
  /** Statement for transaction batch acknowledgement (V2) */
  TX_ACK:
    'This signature acknowledges the intent to report stolen transactions to the Stolen Wallet Registry.',
  /** Statement for transaction batch registration (V2) */
  TX_REG:
    'This signature confirms permanent registration of stolen transactions in the Stolen Wallet Registry. This action is irreversible.',
} as const;

/**
 * V2 Wallet EIP-712 Types.
 * Changes from V1:
 * - `owner` renamed to `wallet`
 * - Added `reportedChainId` (uint64 raw EVM chain ID)
 * - Added `incidentTimestamp` (uint64 Unix timestamp)
 *
 * Note: reportedChainId is the raw chain ID (1, 8453, etc.), NOT a hash.
 * The contract internally converts to CAIP-2 hash for storage.
 */
export const V2_EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'statement', type: 'string' },
    { name: 'wallet', type: 'address' }, // Renamed from 'owner'
    { name: 'forwarder', type: 'address' },
    { name: 'reportedChainId', type: 'uint64' }, // Raw EVM chain ID
    { name: 'incidentTimestamp', type: 'uint64' }, // Unix timestamp
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Registration: [
    { name: 'statement', type: 'string' },
    { name: 'wallet', type: 'address' }, // Renamed from 'owner'
    { name: 'forwarder', type: 'address' },
    { name: 'reportedChainId', type: 'uint64' }, // Raw EVM chain ID
    { name: 'incidentTimestamp', type: 'uint64' }, // Unix timestamp
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** V2 Acknowledgement message for signing */
export interface V2AcknowledgementMessage {
  statement: string;
  wallet: Address; // Renamed from 'owner'
  forwarder: Address;
  reportedChainId: bigint; // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint; // uint64
  nonce: bigint;
  deadline: bigint;
}

/** V2 Registration message for signing */
export interface V2RegistrationMessage {
  statement: string;
  wallet: Address;
  forwarder: Address;
  reportedChainId: bigint; // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint;
  nonce: bigint;
  deadline: bigint;
}

/**
 * V2 Wallet Registration contract arguments.
 * Both hub and spoke now use identical function signatures:
 * - Hub: acknowledge(wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
 * - Spoke: acknowledgeLocal(wallet, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
 *
 * @note reportedChainId is the raw EVM chain ID (1, 8453, etc.), not a hash.
 */
export type WalletRegistrationArgs = readonly [
  wallet: Address,
  reportedChainId: bigint, // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint, // Unix timestamp (uint64)
  deadline: bigint, // Signature expiry (uint256)
  nonce: bigint, // Replay protection (uint256)
  v: number, // Signature v (uint8)
  r: Hash, // Signature r (bytes32)
  s: Hash, // Signature s (bytes32)
];

/**
 * V2 Transaction Batch EIP-712 Types.
 * Changes from V1:
 * - `merkleRoot` replaced by `dataHash` (keccak256 of packed txHashes + chainIds)
 * - Added `reporter` field (explicit signer address)
 * - `transactionCount` present in both ACK and REG (was only in ACK before)
 */
export const V2_TX_EIP712_TYPES = {
  TransactionBatchAcknowledgement: [
    { name: 'statement', type: 'string' },
    { name: 'reporter', type: 'address' }, // NEW explicit field
    { name: 'forwarder', type: 'address' },
    { name: 'dataHash', type: 'bytes32' }, // Replaces merkleRoot
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TransactionBatchRegistration: [
    { name: 'statement', type: 'string' },
    { name: 'reporter', type: 'address' }, // NEW explicit field
    { name: 'forwarder', type: 'address' },
    { name: 'dataHash', type: 'bytes32' }, // Replaces merkleRoot
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' }, // Now in REG too
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** V2 Transaction batch acknowledgement message for signing */
export interface V2TxAcknowledgementMessage {
  statement: string;
  reporter: Address;
  forwarder: Address;
  dataHash: Hash; // keccak256(abi.encodePacked(txHashes, chainIds))
  reportedChainId: Hash;
  transactionCount: number;
  nonce: bigint;
  deadline: bigint;
}

/** V2 Transaction batch registration message for signing */
export interface V2TxRegistrationMessage {
  statement: string;
  reporter: Address;
  forwarder: Address;
  dataHash: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  nonce: bigint;
  deadline: bigint;
}
