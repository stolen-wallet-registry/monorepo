// Transaction batch signature storage utilities
// Stores EIP-712 signatures in sessionStorage (clears on tab close for security)
// NOTE: This file stays in web app (browser-specific, uses sessionStorage)

import { isHex, isAddress } from 'viem';
import { TX_SIGNATURE_STEP, type TxSignatureStep } from '@swr/signatures';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/** Signature session TTL in milliseconds (30 minutes) */
export const TX_SIGNATURE_TTL_MS = 30 * 60 * 1000;

// Storage key format: swr_tx_sig_{dataHash}_{chainId}_{step}
function getStorageKey(dataHash: Hash, chainId: number, step: TxSignatureStep): string {
  return `swr_tx_sig_${dataHash.toLowerCase()}_${chainId}_${step}`;
}

export interface StoredTxSignature {
  signature: Hex;
  deadline: bigint;
  nonce: bigint;
  dataHash: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  reporter: Address;
  forwarder: Address;
  chainId: number;
  step: TxSignatureStep;
  storedAt: number; // timestamp
}

// Serializable version for sessionStorage
interface SerializedTxSignature {
  signature: string;
  deadline: string;
  nonce: string;
  dataHash: string;
  reportedChainId: string;
  transactionCount: number;
  reporter: string;
  forwarder: string;
  chainId: number;
  step: number;
  storedAt: number;
}

// Store a signature
export function storeTxSignature(sig: StoredTxSignature): void {
  const key = getStorageKey(sig.dataHash, sig.chainId, sig.step);
  const serialized: SerializedTxSignature = {
    signature: sig.signature,
    deadline: sig.deadline.toString(),
    nonce: sig.nonce.toString(),
    dataHash: sig.dataHash,
    reportedChainId: sig.reportedChainId,
    transactionCount: sig.transactionCount,
    reporter: sig.reporter,
    forwarder: sig.forwarder,
    chainId: sig.chainId,
    step: sig.step,
    storedAt: sig.storedAt,
  };
  sessionStorage.setItem(key, JSON.stringify(serialized));
}

// Retrieve a signature (returns null if not found or expired)
export function getTxSignature(
  dataHash: Hash,
  chainId: number,
  step: TxSignatureStep
): StoredTxSignature | null {
  const key = getStorageKey(dataHash, chainId, step);
  const stored = sessionStorage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    const parsed: SerializedTxSignature = JSON.parse(stored);

    // Client-side TTL check - additional protection beyond contract deadline
    if (Date.now() - parsed.storedAt > TX_SIGNATURE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }

    // Validate hex format for security-critical signature data
    if (
      !isHex(parsed.signature, { strict: true }) ||
      !isHex(parsed.dataHash, { strict: true }) ||
      !isHex(parsed.reportedChainId, { strict: true }) ||
      !isAddress(parsed.reporter) ||
      !isAddress(parsed.forwarder)
    ) {
      sessionStorage.removeItem(key);
      return null;
    }

    // Validate numeric strings before BigInt conversion
    if (!/^\d+$/.test(parsed.deadline) || !/^\d+$/.test(parsed.nonce)) {
      sessionStorage.removeItem(key);
      return null;
    }

    const signature: StoredTxSignature = {
      signature: parsed.signature as Hex,
      deadline: BigInt(parsed.deadline),
      nonce: BigInt(parsed.nonce),
      dataHash: parsed.dataHash as Hash,
      reportedChainId: parsed.reportedChainId as Hash,
      transactionCount: parsed.transactionCount,
      reporter: parsed.reporter as Address,
      forwarder: parsed.forwarder as Address,
      chainId: parsed.chainId,
      step: parsed.step as TxSignatureStep,
      storedAt: parsed.storedAt,
    };

    return signature;
  } catch {
    // Invalid stored data, remove it
    sessionStorage.removeItem(key);
    return null;
  }
}

// Remove a signature
export function removeTxSignature(dataHash: Hash, chainId: number, step: TxSignatureStep): void {
  const key = getStorageKey(dataHash, chainId, step);
  sessionStorage.removeItem(key);
}

// Clear all signatures for a dataHash on a chain
export function clearTxSignatures(dataHash: Hash, chainId: number): void {
  const steps = Object.values(TX_SIGNATURE_STEP);
  for (const step of steps) {
    removeTxSignature(dataHash, chainId, step);
  }
}

// Clear all SWR transaction signatures from sessionStorage
export function clearAllTxSignatures(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith('swr_tx_sig_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
}
