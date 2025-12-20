// Signature storage utilities
// Stores EIP-712 signatures in sessionStorage (clears on tab close for security)

import type { SignatureStep } from './eip712';
import type { Address, Hex } from '@/lib/types/ethereum';

/** Signature session TTL in milliseconds (30 minutes) */
export const SIGNATURE_TTL_MS = 30 * 60 * 1000;

// Storage key format: swr_sig_{address}_{chainId}_{step}
function getStorageKey(address: Address, chainId: number, step: SignatureStep): string {
  return `swr_sig_${address.toLowerCase()}_${chainId}_${step}`;
}

export interface StoredSignature {
  signature: Hex;
  deadline: bigint;
  nonce: bigint;
  address: Address;
  chainId: number;
  step: SignatureStep;
  storedAt: number; // timestamp
}

// Serializable version for sessionStorage
interface SerializedSignature {
  signature: string;
  deadline: string;
  nonce: string;
  address: string;
  chainId: number;
  step: number;
  storedAt: number;
}

// Store a signature
export function storeSignature(sig: StoredSignature): void {
  const key = getStorageKey(sig.address, sig.chainId, sig.step);
  const serialized: SerializedSignature = {
    signature: sig.signature,
    deadline: sig.deadline.toString(),
    nonce: sig.nonce.toString(),
    address: sig.address,
    chainId: sig.chainId,
    step: sig.step,
    storedAt: sig.storedAt,
  };
  sessionStorage.setItem(key, JSON.stringify(serialized));
}

// Retrieve a signature (returns null if not found or expired)
export function getSignature(
  address: Address,
  chainId: number,
  step: SignatureStep
): StoredSignature | null {
  const key = getStorageKey(address, chainId, step);
  const stored = sessionStorage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    const parsed: SerializedSignature = JSON.parse(stored);

    // Client-side TTL check - additional protection beyond contract deadline
    if (Date.now() - parsed.storedAt > SIGNATURE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }

    const signature: StoredSignature = {
      signature: parsed.signature as Hex,
      deadline: BigInt(parsed.deadline),
      nonce: BigInt(parsed.nonce),
      address: parsed.address as Address,
      chainId: parsed.chainId,
      step: parsed.step as SignatureStep,
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
export function removeSignature(address: Address, chainId: number, step: SignatureStep): void {
  const key = getStorageKey(address, chainId, step);
  sessionStorage.removeItem(key);
}

// Clear all signatures for an address on a chain
export function clearSignatures(address: Address, chainId: number): void {
  const steps = [1, 2] as const;
  for (const step of steps) {
    removeSignature(address, chainId, step);
  }
}

// Clear all SWR signatures from sessionStorage
export function clearAllSignatures(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith('swr_sig_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
}
