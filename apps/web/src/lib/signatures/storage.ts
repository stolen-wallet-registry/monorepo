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
  /**
   * The forwarder the signature was signed over.
   *
   * Part of the EIP-712 struct and verified on-chain, but NOT part of the storage key
   * (`swr_sig_{address}_{chainId}_{step}`). In self-relay the user can go back and edit the
   * gas wallet after signing; without this field the cached signature was still returned and
   * submitted against the NEW forwarder, producing an opaque signature-verification revert
   * instead of a "please re-sign" prompt. Pay steps compare it and treat a mismatch as
   * "signature not found" — see `getSignature`'s `expectedForwarder`.
   *
   * Optional for backward compatibility with signatures stored before this field existed;
   * `getSignature` treats a missing value as unverifiable and therefore a mismatch whenever
   * an expected forwarder is supplied.
   */
  trustedForwarder?: Address;
  /** Raw EVM chain ID where incident occurred (e.g., 1 for mainnet, 8453 for Base) */
  reportedChainId?: bigint;
  /** Unix timestamp when incident occurred */
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
  // Optional fields for incident context
  trustedForwarder?: string;
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
    // Optional fields (backward compatible)
    trustedForwarder: sig.trustedForwarder,
    reportedChainId: sig.reportedChainId?.toString(),
    incidentTimestamp: sig.incidentTimestamp?.toString(),
  };
  sessionStorage.setItem(key, JSON.stringify(serialized));
}

/**
 * Retrieve a signature (returns null if not found, expired, or bound to another forwarder).
 *
 * @param address - Wallet the signature is for
 * @param chainId - Chain the signature was made on
 * @param step - Acknowledgement or registration
 * @param expectedForwarder - When supplied, the signature is only returned if it was signed
 *   over this exact forwarder. The forwarder is part of the EIP-712 struct and verified
 *   on-chain but is NOT part of the storage key, so without this check a signature made for
 *   an earlier gas wallet would be handed to the pay step and revert on-chain. A signature
 *   stored before this field existed has no forwarder to compare and is likewise rejected —
 *   re-signing is cheap, an unexplained revert is not.
 */
export function getSignature(
  address: Address,
  chainId: number,
  step: SignatureStep,
  expectedForwarder?: Address
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

    // Parse and validate optional fields if present
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

    // strict:false — the forwarder may have been stored lowercased (form input, P2P payload)
    // rather than checksummed, and rejecting it on casing alone would silently force a
    // needless re-sign. Comparison below is case-insensitive for the same reason.
    const trustedForwarder =
      parsed.trustedForwarder !== undefined && isAddress(parsed.trustedForwarder, { strict: false })
        ? (parsed.trustedForwarder as Address)
        : undefined;

    // Forwarder binding: a signature is only valid for the forwarder it was signed over.
    // Not removed from storage — the user may switch back to the original gas wallet, in
    // which case this same signature becomes usable again.
    if (
      expectedForwarder !== undefined &&
      (trustedForwarder === undefined ||
        trustedForwarder.toLowerCase() !== expectedForwarder.toLowerCase())
    ) {
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
      // Optional fields (validated above)
      trustedForwarder,
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
