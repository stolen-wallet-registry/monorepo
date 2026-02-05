// Signature storage utilities
// Stores EIP-712 signatures in sessionStorage (clears on tab close for security)
// NOTE: This file stays in web app (browser-specific, uses sessionStorage)

import { isHex, isAddress } from 'viem';
import { SIGNATURE_STEP, type SignatureStep } from '@swr/signatures';
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
  /** V2: Raw EVM chain ID where incident occurred (e.g., 1 for mainnet, 8453 for Base) */
  reportedChainId?: bigint;
  /** V2: Unix timestamp when incident occurred */
  incidentTimestamp?: bigint;
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
  // V2 fields
  reportedChainId?: string;
  incidentTimestamp?: string;
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
    // V2 fields (optional for backward compatibility)
    reportedChainId: sig.reportedChainId?.toString(),
    incidentTimestamp: sig.incidentTimestamp?.toString(),
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

    // Validate hex format for security-critical signature data
    // Malformed but parseable data could cause issues downstream
    if (!isHex(parsed.signature, { strict: true }) || !isAddress(parsed.address)) {
      sessionStorage.removeItem(key);
      return null;
    }

    // Parse and validate V2 fields if present
    let reportedChainId: bigint | undefined;
    let incidentTimestamp: bigint | undefined;

    if (parsed.reportedChainId !== undefined) {
      try {
        reportedChainId = BigInt(parsed.reportedChainId);
        // Chain IDs must be positive
        if (reportedChainId <= 0n) {
          sessionStorage.removeItem(key);
          return null;
        }
      } catch {
        sessionStorage.removeItem(key);
        return null;
      }
    }

    if (parsed.incidentTimestamp !== undefined) {
      try {
        incidentTimestamp = BigInt(parsed.incidentTimestamp);
        // Allow 0 (placeholder) or reasonable range (2020-2100)
        const minTimestamp = 1577836800n; // 2020-01-01
        const maxTimestamp = 4102444800n; // 2100-01-01
        if (
          incidentTimestamp !== 0n &&
          (incidentTimestamp < minTimestamp || incidentTimestamp > maxTimestamp)
        ) {
          sessionStorage.removeItem(key);
          return null;
        }
      } catch {
        sessionStorage.removeItem(key);
        return null;
      }
    }

    const signature: StoredSignature = {
      signature: parsed.signature as Hex,
      deadline: BigInt(parsed.deadline),
      nonce: BigInt(parsed.nonce),
      address: parsed.address as Address,
      chainId: parsed.chainId,
      step: parsed.step as SignatureStep,
      storedAt: parsed.storedAt,
      // V2 fields (validated above)
      reportedChainId,
      incidentTimestamp,
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
  const steps = Object.values(SIGNATURE_STEP);
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
