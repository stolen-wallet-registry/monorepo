/**
 * Relayer-side verification of a signature received over P2P.
 *
 * A relayer pays gas to submit a signature it did not produce, for a wallet it does not
 * control, received from a peer it has only a connection-level binding to. Until now it
 * submitted that signature without ever recovering the signer: `recoverTypedDataAddress`
 * appeared nowhere in the app. Everything here is defence in depth and UX — the contract
 * still verifies the signature, the nonce, the deadline and the forwarder on-chain. The
 * point is that the relayer finds out BEFORE spending gas, and can see who they are paying
 * for.
 *
 * Split deliberately into an async recovery step and a pure review step so the decision
 * logic is testable without a chain, a wallet, or a network.
 */

import { recoverTypedDataAddress } from 'viem';
import {
  buildAcknowledgementTypedData,
  buildRegistrationTypedData,
  SIGNATURE_STEP,
  type SignatureStep,
} from '@swr/signatures';
import {
  buildTxAcknowledgementTypedData,
  buildTxRegistrationTypedData,
  TX_SIGNATURE_STEP,
  type TxSignatureStep,
} from '@swr/signatures';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/** Everything that can be wrong with a relayed signature, in the order we report it. */
export type RelaySignatureIssue =
  | 'recovery-failed'
  | 'pairing-unknown'
  | 'signer-mismatch'
  | 'nonce-mismatch'
  | 'nonce-unknown'
  | 'deadline-expired';

export interface RelaySignatureReview {
  /** Address recovered from the EIP-712 digest, or null if recovery failed. */
  recoveredSigner: Address | null;
  /** Problems found, empty when the signature is safe to pay for. */
  issues: RelaySignatureIssue[];
  /** True only when there are no issues. */
  ok: boolean;
}

export interface ReviewRelayedSignatureInput {
  /** Result of `recoverWalletSignatureSigner` / `recoverTxSignatureSigner`. */
  recoveredSigner: Address | null;
  /**
   * The wallet the relayer agreed OUT OF BAND to pay for — the address half of the pairing
   * token (`lib/p2p/pairingToken.ts`).
   *
   * SECURITY (audit V4): this must never be sourced from anything the peer sent. Comparing a
   * recovered signer against `data.form.registeree`, or against a form-store value written
   * from it, compares the peer's claim with itself: an attacker naming its own wallet passes
   * trivially, and the relayer pays to permanently mark a wallet of the attacker's choosing.
   * Absent (null/undefined) fails closed as `pairing-unknown`.
   */
  expectedSigner: Address | null | undefined;
  /** Nonce the signature commits to. */
  signatureNonce: bigint;
  /** Nonce read back from the contract now, or undefined while unknown. */
  onChainNonce: bigint | undefined;
  /** Signature deadline (unix seconds). */
  deadline: bigint;
  /** Current time in unix seconds. */
  nowSeconds: bigint;
}

/**
 * Decide whether a recovered signature is safe for the relayer to pay for.
 *
 * Pure: no chain access, no clock, no wallet. `nowSeconds` and `onChainNonce` are inputs.
 */
export function reviewRelayedSignature(input: ReviewRelayedSignatureInput): RelaySignatureReview {
  const { recoveredSigner, expectedSigner, signatureNonce, onChainNonce, deadline, nowSeconds } =
    input;

  const issues: RelaySignatureIssue[] = [];

  if (!recoveredSigner) {
    issues.push('recovery-failed');
  } else if (!expectedSigner) {
    // No out-of-band wallet to check against. Reported separately from a mismatch because it
    // is not an accusation and has a different remedy — and because falling back to the
    // peer's own claim here is exactly the hole this check exists to close.
    issues.push('pairing-unknown');
  } else if (recoveredSigner.toLowerCase() !== expectedSigner.toLowerCase()) {
    // The signature is valid ECDSA but was produced by a different key than the wallet named
    // in the pairing code. Submitting it registers someone else's wallet at the relayer's
    // expense.
    issues.push('signer-mismatch');
  }

  if (onChainNonce === undefined) {
    // Not an accusation — the read has not landed. Still blocks payment: the whole point is
    // to check against the chain rather than trust the payload.
    issues.push('nonce-unknown');
  } else if (onChainNonce !== signatureNonce) {
    issues.push('nonce-mismatch');
  }

  if (deadline <= nowSeconds) {
    issues.push('deadline-expired');
  }

  return { recoveredSigner, issues, ok: issues.length === 0 };
}

/**
 * User-facing text for an issue. Relayer-facing UI, so it says what to do, not what failed
 * internally.
 */
export function describeRelaySignatureIssue(issue: RelaySignatureIssue): string {
  switch (issue) {
    case 'recovery-failed':
      return 'The signature could not be verified. Ask your partner to sign again.';
    case 'pairing-unknown':
      return 'This session has no pairing code, so there is no way to confirm which wallet you would be paying for. Restart and paste the pairing code your partner shows you.';
    case 'signer-mismatch':
      return 'The signature was not produced by the wallet named in the pairing code. Do not pay for this transaction.';
    case 'nonce-mismatch':
      return 'The signature uses a nonce the contract has already moved past. Ask your partner to sign again.';
    case 'nonce-unknown':
      return 'Still reading the current nonce from the contract. Payment is blocked until it is confirmed.';
    case 'deadline-expired':
      return 'The signature has expired. Ask your partner to sign again.';
  }
}

export interface RecoverWalletSignatureInput {
  step: SignatureStep;
  signature: Hex;
  chainId: number;
  verifyingContract: Address;
  isHub: boolean;
  wallet: Address;
  trustedForwarder: Address;
  reportedChainId: bigint;
  incidentTimestamp: bigint;
  nonce: bigint;
  deadline: bigint;
  /**
   * Registration only: `blockhash(windowBlock)` the signature committed to. Part of the signed
   * struct, so recovery without it produces a different digest and a bogus signer. Required
   * whenever `step` is REGISTRATION.
   */
  windowBlockHash?: Hash;
}

/**
 * Recover the signer of a wallet-flow acknowledgement/registration signature.
 *
 * @returns the recovered address, or null if the signature is not recoverable over this
 *   exact struct (wrong field, wrong contract, wrong chain, corrupt signature)
 */
export async function recoverWalletSignatureSigner(
  input: RecoverWalletSignatureInput
): Promise<Address | null> {
  const {
    step,
    signature,
    chainId,
    verifyingContract,
    isHub,
    wallet,
    trustedForwarder,
    reportedChainId,
    incidentTimestamp,
    nonce,
    deadline,
    windowBlockHash,
  } = input;

  const message = {
    wallet,
    trustedForwarder,
    reportedChainId,
    incidentTimestamp,
    nonce,
    deadline,
  };

  let typedData;
  if (step === SIGNATURE_STEP.ACKNOWLEDGEMENT) {
    typedData = buildAcknowledgementTypedData(chainId, verifyingContract, isHub, message);
  } else {
    if (!windowBlockHash) {
      // Returning null rather than guessing: without the committed hash the digest is a
      // different message, and "recovered someone else" reads as fraud rather than as the
      // missing field it is.
      logger.signature.warn('Cannot verify relayed registration signature: no windowBlockHash', {
        chainId,
        verifyingContract,
      });
      return null;
    }
    typedData = buildRegistrationTypedData(chainId, verifyingContract, isHub, {
      ...message,
      windowBlockHash,
    });
  }

  try {
    const recovered = await recoverTypedDataAddress({ ...typedData, signature });
    return recovered as Address;
  } catch (error) {
    logger.signature.warn('Could not recover signer from relayed wallet signature', {
      step,
      chainId,
      verifyingContract,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export interface RecoverTxSignatureInput {
  step: TxSignatureStep;
  signature: Hex;
  chainId: number;
  verifyingContract: Address;
  isHub: boolean;
  reporter: Address;
  trustedForwarder: Address;
  dataHash: Hash;
  reportedChainId: Hash;
  transactionCount: number;
  nonce: bigint;
  deadline: bigint;
  /** Registration only — see {@link RecoverWalletSignatureInput.windowBlockHash}. */
  windowBlockHash?: Hash;
}

/**
 * Recover the signer of a transaction-batch acknowledgement/registration signature.
 *
 * @returns the recovered address, or null if the signature is not recoverable over this
 *   exact struct
 */
export async function recoverTxSignatureSigner(
  input: RecoverTxSignatureInput
): Promise<Address | null> {
  const {
    step,
    signature,
    chainId,
    verifyingContract,
    isHub,
    reporter,
    trustedForwarder,
    dataHash,
    reportedChainId,
    transactionCount,
    nonce,
    deadline,
    windowBlockHash,
  } = input;

  const message = {
    reporter,
    trustedForwarder,
    dataHash,
    reportedChainId,
    transactionCount,
    nonce,
    deadline,
  };

  let typedData;
  if (step === TX_SIGNATURE_STEP.ACKNOWLEDGEMENT) {
    typedData = buildTxAcknowledgementTypedData(chainId, verifyingContract, isHub, message);
  } else {
    if (!windowBlockHash) {
      logger.signature.warn('Cannot verify relayed transaction signature: no windowBlockHash', {
        chainId,
        verifyingContract,
      });
      return null;
    }
    typedData = buildTxRegistrationTypedData(chainId, verifyingContract, isHub, {
      ...message,
      windowBlockHash,
    });
  }

  try {
    const recovered = await recoverTypedDataAddress({ ...typedData, signature });
    return recovered as Address;
  } catch (error) {
    logger.signature.warn('Could not recover signer from relayed transaction signature', {
      step,
      chainId,
      verifyingContract,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
