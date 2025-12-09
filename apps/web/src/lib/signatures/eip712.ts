// EIP-712 typed data definitions for StolenWalletRegistry
// Matches contract: StolenWalletRegistry.sol version 4

import type { TypedDataDomain } from 'viem';

// EIP-712 Domain configuration
export const EIP712_DOMAIN_NAME = 'StolenWalletRegistry';
export const EIP712_DOMAIN_VERSION = '4';

// Type hashes from contract
export const TYPE_HASHES = {
  ACKNOWLEDGEMENT: '0x5d29f5466c65723821dcc0b8c03d313c167487cda1efe0d5381d304f61bb85d2',
  REGISTRATION: '0x84a9e85d406e54d479a4c4f1ec22065370770f384a4b1e9f49d3dcf5ab26ad49',
} as const;

// EIP-712 type definitions
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

// Get EIP-712 domain for a specific chain and contract
export function getEIP712Domain(
  chainId: number,
  verifyingContract: `0x${string}`
): TypedDataDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract,
  };
}

// Message types for signing
export interface AcknowledgementMessage {
  owner: `0x${string}`;
  forwarder: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
}

export interface RegistrationMessage {
  owner: `0x${string}`;
  forwarder: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
}

// Step enum matching contract (1 = ACK, 2 = REG)
export const SIGNATURE_STEP = {
  ACKNOWLEDGEMENT: 1,
  REGISTRATION: 2,
} as const;

export type SignatureStep = (typeof SIGNATURE_STEP)[keyof typeof SIGNATURE_STEP];

// Build typed data for acknowledgement signature
export function buildAcknowledgementTypedData(
  chainId: number,
  contractAddress: `0x${string}`,
  message: AcknowledgementMessage
) {
  return {
    domain: getEIP712Domain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'AcknowledgementOfRegistry' as const,
    message,
  };
}

// Build typed data for registration signature
export function buildRegistrationTypedData(
  chainId: number,
  contractAddress: `0x${string}`,
  message: RegistrationMessage
) {
  return {
    domain: getEIP712Domain(chainId, contractAddress),
    types: EIP712_TYPES,
    primaryType: 'Registration' as const,
    message,
  };
}
