// Transaction batch signature storage utilities
// Stores EIP-712 signatures in sessionStorage (clears on tab close for security)
// NOTE: This file stays in web app (browser-specific, uses sessionStorage)

import { isHex, isAddress, size } from 'viem';
import type { TxSignatureStep } from '@swr/signatures';
import { logger } from '@/lib/logger';
import { SignatureStorageError } from '@/lib/signatures/storage';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/** Signature session TTL in milliseconds (30 minutes) */
export const TX_SIGNATURE_TTL_MS = 30 * 60 * 1000;

/**
 * Storage key format: `swr_tx_sig_{reporter}_{dataHash}_{chainId}_{step}`.
 *
 * `reporter` is in the key because `dataHash` is `keccak256(abi.encode(txHashes, chainIds))` —
 * it commits to the batch contents and to nothing about who is reporting them. Two reporters
 * submitting the same transaction set on the same chain therefore produced the same key, and a
 * browser that had handled both (a relayer running back-to-back P2P sessions) returned the
 * first reporter's signature — and its `reporter` field — for the second. The P2P path fails
 * closed on the `pairedWallet` signer check, but standard and self-relay have no such gate and
 * would submit a signature that cannot verify against the connected wallet.
 */
function getStorageKey(
  reporter: Address,
  dataHash: Hash,
  chainId: number,
  step: TxSignatureStep
): string {
  return `swr_tx_sig_${reporter.toLowerCase()}_${dataHash.toLowerCase()}_${chainId}_${step}`;
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

/**
 * Store a signature.
 *
 * @throws {SignatureStorageError} if sessionStorage refuses the write. See
 *   {@link SignatureStorageError} — this happens AFTER the user approved the signature in
 *   their wallet, so it has to be reported rather than swallowed.
 */
export function storeTxSignature(sig: StoredTxSignature): void {
  const key = getStorageKey(sig.reporter, sig.dataHash, sig.chainId, sig.step);
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
  try {
    sessionStorage.setItem(key, JSON.stringify(serialized));
  } catch (err) {
    logger.signature.error(
      'Failed to persist transaction batch signature to sessionStorage',
      { dataHash: sig.dataHash, chainId: sig.chainId, step: sig.step },
      err instanceof Error ? err : undefined
    );
    throw new SignatureStorageError();
  }
}

/**
 * Retrieve a signature (returns null if not found, expired, or bound to another forwarder).
 *
 * @param reporter - The address that signed. Part of the storage key: `dataHash` carries no
 *   identity, so without this two reporters with the same batch on the same chain share a slot.
 * @param dataHash - The batch commitment the signature was made over
 * @param chainId - Chain the signature was made on
 * @param step - Acknowledgement or registration
 * @param expectedForwarder - When supplied, the signature is only returned if it was signed
 *   over this exact forwarder.
 *
 *   The forwarder is part of the EIP-712 struct and verified on-chain, but is NOT part of the
 *   storage key (`swr_tx_sig_{dataHash}_{chainId}_{step}`). In self-relay the reporter can go
 *   back and change the gas wallet after signing; without this check the cached signature —
 *   naming the OLD gas wallet — is still returned, and the pay step then demands the reporter
 *   connect the very wallet they just replaced, with no way to re-sign. This mirrors the
 *   wallet flow's `getSignature`; see the long note on `StoredSignature.trustedForwarder`.
 *
 *   Not removed from storage on a mismatch: switching back to the original gas wallet makes
 *   this same signature usable again.
 */
export function getTxSignature(
  reporter: Address,
  dataHash: Hash,
  chainId: number,
  step: TxSignatureStep,
  expectedForwarder?: Address
): StoredTxSignature | null {
  const key = getStorageKey(reporter, dataHash, chainId, step);
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

    // The reporter is part of the key, so this can only disagree for a hand-edited entry — but
    // the stored `reporter` is what the pay steps submit as the signer, so a disagreement means
    // the record is not what its key claims and must not be used.
    if (parsed.reporter.toLowerCase() !== reporter.toLowerCase()) {
      sessionStorage.removeItem(key);
      return null;
    }

    // Forwarder binding: a signature is only valid for the forwarder it was signed over.
    // Case-insensitive because the forwarder reaches storage from a form input or a P2P
    // payload and may not be checksummed, and rejecting on casing alone would force a
    // needless re-sign. Deliberately does NOT remove the record — the user may switch back to
    // the original gas wallet, at which point this signature is usable again.
    if (
      expectedForwarder !== undefined &&
      parsed.trustedForwarder.toLowerCase() !== expectedForwarder.toLowerCase()
    ) {
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
export function removeTxSignature(
  reporter: Address,
  dataHash: Hash,
  chainId: number,
  step: TxSignatureStep
): void {
  sessionStorage.removeItem(getStorageKey(reporter, dataHash, chainId, step));
}

/**
 * Clear all SWR transaction signatures from sessionStorage.
 *
 * Prefix-matched rather than key-reconstructed, so this also sweeps records written under the
 * pre-`reporter` key format. Those are otherwise unreadable but harmless: nothing looks them up,
 * sessionStorage dies with the tab, and the 30-minute TTL makes them stale either way.
 */
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
