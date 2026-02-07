/**
 * EIP-712 type definitions for SWR registries.
 */

import type { Address, Hash } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════
// STATEMENT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Human-readable statements displayed in wallet signing UI (e.g., MetaMask).
 * These MUST match the contract constants in EIP712Constants.sol exactly.
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
    'This signature acknowledges the intent to report stolen transactions to the Stolen Wallet Registry.',
  /** Statement for transaction batch registration */
  TX_REG:
    'This signature confirms permanent registration of stolen transactions in the Stolen Wallet Registry. This action is irreversible.',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// WALLET REGISTRY EIP-712 TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wallet EIP-712 Types.
 * - `wallet` field (address of the wallet being registered)
 * - `reportedChainId` (uint64 raw EVM chain ID)
 * - `incidentTimestamp` (uint64 Unix timestamp)
 *
 * Note: reportedChainId is the raw chain ID (1, 8453, etc.), NOT a hash.
 * The contract internally converts to CAIP-2 hash for storage.
 */
export const EIP712_TYPES = {
  AcknowledgementOfRegistry: [
    { name: 'statement', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'reportedChainId', type: 'uint64' },
    { name: 'incidentTimestamp', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Registration: [
    { name: 'statement', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'reportedChainId', type: 'uint64' },
    { name: 'incidentTimestamp', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Acknowledgement message for signing (statement added internally by builders) */
export interface AcknowledgementMessage {
  statement: string;
  wallet: Address;
  forwarder: Address;
  reportedChainId: bigint; // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint; // uint64
  nonce: bigint;
  deadline: bigint;
}

/** Registration message for signing (statement added internally by builders) */
export interface RegistrationMessage {
  statement: string;
  wallet: Address;
  forwarder: Address;
  reportedChainId: bigint; // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint;
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
// TRANSACTION REGISTRY EIP-712 TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transaction Batch EIP-712 Types.
 * - `dataHash` (keccak256(abi.encode(txHashes, chainIds)))
 * - `reporter` field (explicit signer address)
 * - `transactionCount` present in both ACK and REG
 */
export const TX_EIP712_TYPES = {
  TransactionBatchAcknowledgement: [
    { name: 'statement', type: 'string' },
    { name: 'reporter', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TransactionBatchRegistration: [
    { name: 'statement', type: 'string' },
    { name: 'reporter', type: 'address' },
    { name: 'forwarder', type: 'address' },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'reportedChainId', type: 'bytes32' },
    { name: 'transactionCount', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Transaction batch acknowledgement message for signing (statement added internally by builders) */
export interface TxAcknowledgementMessage {
  statement: string;
  reporter: Address;
  forwarder: Address;
  dataHash: Hash; // keccak256(abi.encode(txHashes, chainIds))
  reportedChainId: Hash;
  transactionCount: number;
  nonce: bigint;
  deadline: bigint;
}

/** Transaction batch registration message for signing (statement added internally by builders) */
export interface TxRegistrationMessage {
  statement: string;
  reporter: Address;
  forwarder: Address;
  dataHash: Hash;
  reportedChainId: Hash;
  transactionCount: number;
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
 * Wallet Acknowledgement contract arguments (unified hub and spoke).
 * acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
 *
 * isSponsored is derived on-chain as (wallet != forwarder).
 */
export type WalletAcknowledgeArgs = readonly [
  registeree: Address,
  forwarder: Address,
  reportedChainId: bigint, // Raw EVM chain ID (uint64)
  incidentTimestamp: bigint, // Unix timestamp (uint64)
  deadline: bigint, // Signature expiry (uint256)
  nonce: bigint, // Replay protection nonce (uint256)
  v: number, // Signature v (uint8)
  r: Hash, // Signature r (bytes32)
  s: Hash, // Signature s (bytes32)
];

/**
 * Wallet Registration contract arguments (unified hub and spoke).
 * register(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
 *
 * @note reportedChainId is uint64 raw EVM chain ID. Contract converts to CAIP-2 hash internally.
 */
export type WalletRegistrationArgs = readonly [
  registeree: Address,
  forwarder: Address, // Must match acknowledge phase and msg.sender
  reportedChainId: bigint, // Raw EVM chain ID (uint64) — contract converts to CAIP-2 hash
  incidentTimestamp: bigint, // Unix timestamp (uint64)
  deadline: bigint, // Signature expiry (uint256)
  nonce: bigint, // Replay protection nonce (uint256)
  v: number, // Signature v (uint8)
  r: Hash, // Signature r (bytes32)
  s: Hash, // Signature s (bytes32)
];
