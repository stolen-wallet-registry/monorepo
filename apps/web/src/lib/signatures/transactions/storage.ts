// Transaction batch signature storage utilities
// Stores EIP-712 signatures in sessionStorage (clears on tab close for security)
// NOTE: This file stays in web app (browser-specific, uses sessionStorage)

import { isHex, isAddress, size } from 'viem';
import type { TxSignatureStep } from '@swr/signatures';
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
  trustedForwarder: Address;
  chainId: number;
  step: TxSignatureStep;
  storedAt: number; // timestamp
  /**
   * Block number whose hash the REGISTRATION signature committed to (anti-phishing control).
   *
   * The signature covers `blockhash(windowBlock)`, so the pay step must submit this exact
   * number — the contract recomputes the hash from it and compares. Undefined for
   * acknowledgement signatures, which carry no freshness commitment.
   */
  windowBlock?: bigint;
  /**
   * `blockhash(windowBlock)` — the value inside the signed struct. Needed by a relayer
   * re-verifying a signature received over P2P, which cannot re-read the hash once the chain
   * has moved past 256 blocks. Undefined for acknowledgement signatures.
   */
  windowBlockHash?: Hash;
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
  trustedForwarder: string;
  chainId: number;
  step: number;
  storedAt: number;
  windowBlock?: string;
  windowBlockHash?: string;
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
    trustedForwarder: sig.trustedForwarder,
    chainId: sig.chainId,
    step: sig.step,
    storedAt: sig.storedAt,
    windowBlock: sig.windowBlock?.toString(),
    windowBlockHash: sig.windowBlockHash,
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
    // dataHash and reportedChainId must be exactly 32 bytes (bytes32 in EIP-712)
    if (
      !isHex(parsed.signature, { strict: true }) ||
      !(isHex(parsed.dataHash, { strict: true }) && size(parsed.dataHash) === 32) ||
      !(isHex(parsed.reportedChainId, { strict: true }) && size(parsed.reportedChainId) === 32) ||
      !isAddress(parsed.reporter) ||
      !isAddress(parsed.trustedForwarder)
    ) {
      sessionStorage.removeItem(key);
      return null;
    }

    // Validate numeric strings before BigInt conversion. windowBlock is submitted verbatim as
    // calldata, so a corrupted value would surface as an opaque revert; block 0 has no usable
    // hash, so it counts as corruption.
    if (!/^\d+$/.test(parsed.deadline) || !/^\d+$/.test(parsed.nonce)) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (parsed.windowBlock !== undefined && !/^[1-9]\d*$/.test(parsed.windowBlock)) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (
      parsed.windowBlockHash !== undefined &&
      !(isHex(parsed.windowBlockHash, { strict: true }) && size(parsed.windowBlockHash) === 32)
    ) {
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
      trustedForwarder: parsed.trustedForwarder as Address,
      chainId: parsed.chainId,
      step: parsed.step as TxSignatureStep,
      storedAt: parsed.storedAt,
      windowBlock: parsed.windowBlock !== undefined ? BigInt(parsed.windowBlock) : undefined,
      windowBlockHash: parsed.windowBlockHash as Hash | undefined,
    };

    return signature;
  } catch {
    // Invalid stored data, remove it
    sessionStorage.removeItem(key);
    return null;
  }
}

/**
 * Remove a single stored transaction-batch signature.
 *
 * Needed by the pay steps: a revert that invalidates the signature (expired deadline,
 * consumed nonce, expired forwarder) must discard it, or Retry rebuilds the identical
 * transaction from the identical cached bytes and reverts identically forever.
 */
export function removeTxSignature(dataHash: Hash, chainId: number, step: TxSignatureStep): void {
  sessionStorage.removeItem(getStorageKey(dataHash, chainId, step));
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
