// Signature storage utilities
// Stores EIP-712 signatures in localStorage with expiry

import type { SignatureStep } from './eip712';

// Storage key format: swr_sig_{address}_{chainId}_{step}
function getStorageKey(address: `0x${string}`, chainId: number, step: SignatureStep): string {
  return `swr_sig_${address.toLowerCase()}_${chainId}_${step}`;
}

export interface StoredSignature {
  signature: `0x${string}`;
  deadline: bigint;
  nonce: bigint;
  address: `0x${string}`;
  chainId: number;
  step: SignatureStep;
  storedAt: number; // timestamp
}

// Serializable version for localStorage
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
  localStorage.setItem(key, JSON.stringify(serialized));
}

// Retrieve a signature (returns null if not found or expired)
export function getSignature(
  address: `0x${string}`,
  chainId: number,
  step: SignatureStep
): StoredSignature | null {
  const key = getStorageKey(address, chainId, step);
  const stored = localStorage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    const parsed: SerializedSignature = JSON.parse(stored);
    const signature: StoredSignature = {
      signature: parsed.signature as `0x${string}`,
      deadline: BigInt(parsed.deadline),
      nonce: BigInt(parsed.nonce),
      address: parsed.address as `0x${string}`,
      chainId: parsed.chainId,
      step: parsed.step as SignatureStep,
      storedAt: parsed.storedAt,
    };

    // Check if signature is still valid (deadline is block number, not timestamp)
    // We can't check block number here, so just return it
    // The contract will validate the deadline
    return signature;
  } catch {
    // Invalid stored data, remove it
    localStorage.removeItem(key);
    return null;
  }
}

// Remove a signature
export function removeSignature(
  address: `0x${string}`,
  chainId: number,
  step: SignatureStep
): void {
  const key = getStorageKey(address, chainId, step);
  localStorage.removeItem(key);
}

// Clear all signatures for an address on a chain
export function clearSignatures(address: `0x${string}`, chainId: number): void {
  const steps = [1, 2] as const;
  for (const step of steps) {
    removeSignature(address, chainId, step);
  }
}

// Clear all SWR signatures from localStorage
export function clearAllSignatures(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('swr_sig_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
