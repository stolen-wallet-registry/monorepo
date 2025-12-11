/**
 * Signature parsing and validation utilities.
 */

import { hexToSignature } from 'viem';

/**
 * Parsed signature components for contract calls.
 */
export interface ParsedSignature {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/**
 * Parses a signature hex string into v, r, s components.
 * Required format for contract calls.
 *
 * @param signature - The full signature hex string
 * @returns Parsed signature components
 */
export function parseSignature(signature: `0x${string}`): ParsedSignature {
  const { v, r, s } = hexToSignature(signature);
  return {
    v: Number(v),
    r,
    s,
  };
}

/**
 * Checks if a signature's deadline has passed.
 *
 * @param deadline - The deadline block number
 * @param currentBlock - The current block number
 * @returns true if the deadline has passed (signature expired)
 */
export function isSignatureExpired(deadline: bigint, currentBlock: bigint): boolean {
  return currentBlock >= deadline;
}

/**
 * Validates that a signature is within the valid submission window.
 * For acknowledgement: deadline is the absolute deadline
 * For registration: must be after startBlock and before deadline
 *
 * @param startBlock - The start block (registration window opens)
 * @param deadlineBlock - The deadline block (window closes)
 * @param currentBlock - The current block number
 * @returns true if within valid window
 */
export function isWithinRegistrationWindow(
  startBlock: bigint,
  deadlineBlock: bigint,
  currentBlock: bigint
): boolean {
  return currentBlock >= startBlock && currentBlock < deadlineBlock;
}

/**
 * Human-readable signature step names.
 */
export const STEP_NAMES = {
  1: 'Acknowledgement',
  2: 'Registration',
} as const;

/**
 * Gets a human-readable name for a signature step.
 */
export function getStepName(step: 1 | 2): string {
  return STEP_NAMES[step];
}

/**
 * Validates signature format (basic check).
 * Full validation happens on-chain via ECDSA.
 */
export function isValidSignatureFormat(signature: unknown): signature is `0x${string}` {
  if (typeof signature !== 'string') return false;
  if (!signature.startsWith('0x')) return false;
  // EIP-712 signatures should be 65 bytes (130 hex chars + 0x)
  if (signature.length !== 132) return false;
  // Check all characters are valid hex
  return /^0x[0-9a-fA-F]{130}$/.test(signature);
}
