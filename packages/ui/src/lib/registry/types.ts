/**
 * Shared registry types used by both web app and landing page.
 */

import type { Address, Hex } from 'viem';

/**
 * Registration data from the contract.
 * Contains metadata about when and how a wallet was registered.
 */
export interface RegistrationData {
  /** Block number when registration was completed (on hub chain) */
  registeredAt: bigint;
  /** EIP-155 chain ID where user signed (0 for native hub registration) */
  sourceChainId: number;
  /** Bridge that delivered message (0=NONE for native) */
  bridgeId: number;
  /** Whether registration was sponsored (paid by different wallet) */
  isSponsored: boolean;
  /** Cross-chain message ID for explorer linking (0x0 for native) */
  crossChainMessageId: Hex;
}

/**
 * Acknowledgement data from the contract.
 * Contains grace period information for pending registrations.
 */
export interface AcknowledgementData {
  /** Address authorized to submit registration */
  trustedForwarder: Address;
  /** Block when grace period starts */
  startBlock: bigint;
  /** Block when acknowledgement expires */
  expiryBlock: bigint;
}

/**
 * Combined registry status for a wallet.
 * Returned by queryRegistryStatus.
 */
export interface RegistryStatusResult {
  /** Whether the wallet is registered as stolen */
  isRegistered: boolean;
  /** Whether the wallet has a pending acknowledgement */
  isPending: boolean;
  /** Registration details (if registered) */
  registrationData: RegistrationData | null;
  /** Acknowledgement details (if pending) */
  acknowledgementData: AcknowledgementData | null;
}

/**
 * Simplified status for display purposes.
 */
export type ResultStatus = 'registered' | 'pending' | 'not-found';
