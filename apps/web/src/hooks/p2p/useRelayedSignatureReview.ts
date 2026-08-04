/**
 * "Review before you pay" checks for a relayer holding a signature it received over P2P.
 *
 * Recovers the signer from the EIP-712 digest, re-reads the nonce from the contract, and
 * checks the deadline against the wall clock. The nonce and deadline checks are defence in
 * depth — the contract enforces both on-chain — but the relayer is the one spending gas, so
 * it should find out first.
 *
 * The signer check is NOT defence in depth. The contract will happily register whatever
 * wallet signed, because that wallet consented; only the relayer can decide whether that is
 * the wallet it agreed to spend money on. So the comparison must be against an out-of-band
 * value, and the only one that exists is `pairedWallet` — the address half of the pairing
 * token the relayer pasted (audit V4). It is read from the store here rather than accepted as
 * a prop so no caller can hand this check a value that arrived over the wire.
 */

import { useEffect, useMemo, useState } from 'react';
import { useChainId } from 'wagmi';
import { useContractNonce, useTxContractNonce } from '@/hooks/useContractNonce';
import { resolveRegistryContract } from '@/lib/contracts/resolveContract';
import {
  recoverWalletSignatureSigner,
  recoverTxSignatureSigner,
  reviewRelayedSignature,
  type RelaySignatureReview,
} from '@/lib/signatures/relayVerification';
import { SIGNATURE_STEP, TX_SIGNATURE_STEP } from '@swr/signatures';
import type { SignatureStep, TxSignatureStep } from '@swr/signatures';
import { useP2PStore } from '@/stores/p2pStore';
import type { StoredSignature } from '@/lib/signatures';
import type { StoredTxSignature } from '@/lib/signatures/transactions';
import { logger } from '@/lib/logger';
import type { Address } from '@/lib/types/ethereum';

/** How often the deadline is re-evaluated against the clock. */
const CLOCK_TICK_MS = 5_000;

export interface UseRelayedSignatureReviewResult {
  /** Null until the first recovery attempt has completed. */
  review: RelaySignatureReview | null;
  /** True while a recovery is in flight. */
  isChecking: boolean;
}

/**
 * Wall clock in unix seconds, re-read on an interval so an expiring deadline is noticed.
 *
 * Read at render rather than held in state, so there is no seed that can go stale. These hooks
 * mount disabled — `enabled` is `role === 'relayer' && !!storedSig`, and the signature arrives
 * later — so a value captured by a `useState` initialiser would be arbitrarily old by the time
 * the review first runs. That stale clock reported a just-expired deadline as still valid and
 * unblocked the pay button. The contract rejects such a signature, so the cost is gas rather
 * than a bad registration — but the check exists precisely so the relayer finds out before
 * spending it.
 */
function useNowSeconds(enabled: boolean): bigint {
  // The interval only forces a re-render; the time itself is read at render. Holding the clock
  // in state is what created the staleness — the seed was captured at mount, and these hooks
  // mount disabled, so the first verdict was computed against a clock that could be minutes
  // old. Reading it here means the value is current whenever a verdict is produced, including
  // on the render that first enables the hook.
  //
  // The return is whole seconds, so the value is a stable `bigint` between ticks and the
  // `review` memo downstream still only recomputes when the second actually changes.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return BigInt(Math.floor(Date.now() / 1000));
}

export interface UseRelayedWalletSignatureReviewParams {
  /** Only run for the relayer role, and only once a signature is in hand. */
  enabled: boolean;
  step: SignatureStep;
  storedSignature: StoredSignature | null;
  /**
   * Who the peer *claims* the signature belongs to (the form-store registeree).
   *
   * Logged and nothing else. It is not what payment is gated on: on the relayer side this
   * value is written from the peer's own CONNECT payload, so checking a recovered signer
   * against it compares a claim with itself. Gating uses `pairedWallet` from the P2P store.
   */
  expectedSigner: Address | null | undefined;
  /** The relayer's own address — the forwarder named in the signed struct. */
  trustedForwarder: Address | undefined;
  /**
   * Chain head as last read, for the 256-block `blockhash` staleness check on registration
   * signatures. Supplied by the caller rather than read here because every pay step already
   * has it from `getDeadlines` — see {@link isWindowBlockStale}. Omit on acknowledgement
   * steps, which carry no window commitment.
   */
  currentBlock?: bigint;
}

/**
 * Verify a relayed wallet-flow signature before the relayer pays for it.
 */
export function useRelayedWalletSignatureReview({
  enabled,
  step,
  storedSignature,
  expectedSigner,
  trustedForwarder,
  currentBlock,
}: UseRelayedWalletSignatureReviewParams): UseRelayedSignatureReviewResult {
  const chainId = useChainId();
  const { address: contractAddress, role } = resolveRegistryContract(
    chainId,
    'wallet',
    'useRelayedWalletSignatureReview'
  );
  // The out-of-band wallet, and the only address in this hook that the peer did not supply.
  const pairedWallet = useP2PStore((s) => s.pairedWallet);
  // Read the nonce for the paired wallet, not the claimed one: the contract checks the
  // signer's nonce, and a peer that could steer this read could make a stale signature look
  // current.
  const { nonce: onChainNonce } = useContractNonce(
    enabled && pairedWallet ? pairedWallet : undefined,
    'wallet'
  );
  const nowSeconds = useNowSeconds(enabled);

  const [recoveredSigner, setRecoveredSigner] = useState<Address | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const signature = storedSignature?.signature;
  const reportedChainId = storedSignature?.reportedChainId;
  const incidentTimestamp = storedSignature?.incidentTimestamp;
  const nonce = storedSignature?.nonce;
  const deadline = storedSignature?.deadline;
  const wallet = storedSignature?.address;
  // Part of the registration struct; recovery without it yields a different digest.
  const windowBlockHash = storedSignature?.windowBlockHash;
  // Submitted as calldata; checked against `currentBlock` for the 256-block blockhash window.
  const windowBlock = storedSignature?.windowBlock;

  useEffect(() => {
    // Cleared FIRST, before any bail-out. `review` is memoized over recoveredSigner (the old
    // signature) plus nonce/deadline (already the new one), and `ok` gates the pay button —
    // so returning early with the previous verdict still standing reports the OLD signature's
    // signer as verified for a signature that has not been checked. That is reachable
    // whenever a replacement signature arrives missing a field the guard below requires.
    setRecoveredSigner(null);
    setHasChecked(false);

    if (
      !enabled ||
      !signature ||
      !contractAddress ||
      !wallet ||
      !trustedForwarder ||
      reportedChainId === undefined ||
      incidentTimestamp === undefined ||
      nonce === undefined ||
      deadline === undefined ||
      // Registration signs over the committed window block hash. It is passed into recovery
      // below, so a registration signature arriving without it recovers against a different
      // digest and yields some unrelated address — surfacing as "signer mismatch", which
      // reads as an accusation against the partner rather than a truncated message.
      (step === SIGNATURE_STEP.REGISTRATION && !windowBlockHash)
    ) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    recoverWalletSignatureSigner({
      step,
      signature,
      chainId,
      verifyingContract: contractAddress,
      isHub: role !== 'spoke',
      wallet,
      trustedForwarder,
      reportedChainId,
      incidentTimestamp,
      nonce,
      deadline,
      windowBlockHash,
    })
      .then((recovered) => {
        if (cancelled) return;
        setRecoveredSigner(recovered);
        setHasChecked(true);
        logger.signature.info('Recovered signer for relayed wallet signature', {
          step,
          recovered,
          // Both are logged so a mismatch between what the peer claimed and what was agreed
          // out of band is visible in the log, not just its consequence.
          claimedSigner: expectedSigner,
        });
      })
      .catch((err: unknown) => {
        // Recovery swallows its own errors, but typed-data construction ahead of it can
        // throw. Mark the check complete with no signer so the review renders a failure
        // instead of stranding the panel in "Verifying…" with payment blocked forever.
        if (cancelled) return;
        setRecoveredSigner(null);
        setHasChecked(true);
        logger.signature.error(
          'Failed to recover signer for relayed wallet signature',
          { step },
          err instanceof Error ? err : undefined
        );
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return () => {
      cancelled = true;
    };
    // expectedSigner is only logged, so it is deliberately not a dependency: it would re-run
    // recovery without changing its result.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expectedSigner is log-only
  }, [
    enabled,
    step,
    signature,
    chainId,
    contractAddress,
    role,
    wallet,
    trustedForwarder,
    reportedChainId,
    incidentTimestamp,
    nonce,
    deadline,
    windowBlockHash,
  ]);

  const review = useMemo(() => {
    if (!enabled || !hasChecked || nonce === undefined || deadline === undefined) return null;
    return reviewRelayedSignature({
      recoveredSigner,
      // pairedWallet, never the prop: see the module comment. Null here fails closed as
      // `pairing-unknown` rather than falling back to the peer's claim.
      expectedSigner: pairedWallet,
      signatureNonce: nonce,
      onChainNonce,
      deadline,
      nowSeconds,
      windowBlock,
      currentBlock,
    });
  }, [
    enabled,
    hasChecked,
    recoveredSigner,
    pairedWallet,
    nonce,
    onChainNonce,
    deadline,
    nowSeconds,
    windowBlock,
    currentBlock,
  ]);

  return { review, isChecking };
}

export interface UseRelayedTxSignatureReviewParams {
  enabled: boolean;
  step: TxSignatureStep;
  storedSignature: StoredTxSignature | null | undefined;
  /** Peer-claimed reporter. Logged only — gating uses `pairedWallet`; see the wallet hook. */
  expectedSigner: Address | null | undefined;
  trustedForwarder: Address | undefined;
  /** See {@link UseRelayedWalletSignatureReviewParams.currentBlock}. */
  currentBlock?: bigint;
}

/**
 * Verify a relayed transaction-batch signature before the relayer pays for it.
 */
export function useRelayedTxSignatureReview({
  enabled,
  step,
  storedSignature,
  expectedSigner,
  trustedForwarder,
  currentBlock,
}: UseRelayedTxSignatureReviewParams): UseRelayedSignatureReviewResult {
  const chainId = useChainId();
  const { address: contractAddress, role } = resolveRegistryContract(
    chainId,
    'transaction',
    'useRelayedTxSignatureReview'
  );
  const pairedWallet = useP2PStore((s) => s.pairedWallet);
  const { nonce: onChainNonce } = useTxContractNonce(
    enabled && pairedWallet ? pairedWallet : undefined
  );
  const nowSeconds = useNowSeconds(enabled);

  const [recoveredSigner, setRecoveredSigner] = useState<Address | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const signature = storedSignature?.signature;
  const dataHash = storedSignature?.dataHash;
  const reportedChainId = storedSignature?.reportedChainId;
  const transactionCount = storedSignature?.transactionCount;
  const nonce = storedSignature?.nonce;
  const deadline = storedSignature?.deadline;
  const reporter = storedSignature?.reporter;
  // Part of the registration struct; recovery without it yields a different digest.
  const windowBlockHash = storedSignature?.windowBlockHash;
  // Submitted as calldata; checked against `currentBlock` for the 256-block blockhash window.
  const windowBlock = storedSignature?.windowBlock;

  useEffect(() => {
    // Cleared before any bail-out — see the wallet hook for why an early return that leaves
    // the previous verdict standing can report an unchecked signature as safe to pay for.
    setRecoveredSigner(null);
    setHasChecked(false);

    if (
      !enabled ||
      !signature ||
      !contractAddress ||
      !reporter ||
      !trustedForwarder ||
      !dataHash ||
      // Explicit undefined check, matching the wallet hook: a falsy-but-present value (an
      // all-zero chain hash) must be reviewed and flagged, not silently skipped — skipping
      // leaves `review` null, which reads the same as "nothing to verify".
      reportedChainId === undefined ||
      transactionCount === undefined ||
      nonce === undefined ||
      deadline === undefined ||
      // Signed over by the registration struct and passed into recovery below; without it
      // recovery runs against a different digest and reports a bogus signer mismatch.
      (step === TX_SIGNATURE_STEP.REGISTRATION && !windowBlockHash)
    ) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    recoverTxSignatureSigner({
      step,
      signature,
      chainId,
      verifyingContract: contractAddress,
      isHub: role !== 'spoke',
      reporter,
      trustedForwarder,
      dataHash,
      reportedChainId,
      transactionCount,
      nonce,
      deadline,
      windowBlockHash,
    })
      .then((recovered) => {
        if (cancelled) return;
        setRecoveredSigner(recovered);
        setHasChecked(true);
        logger.signature.info('Recovered signer for relayed transaction signature', {
          step,
          recovered,
          claimedSigner: expectedSigner,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRecoveredSigner(null);
        setHasChecked(true);
        logger.signature.error(
          'Failed to recover signer for relayed transaction signature',
          { step },
          err instanceof Error ? err : undefined
        );
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expectedSigner is log-only
  }, [
    enabled,
    step,
    signature,
    chainId,
    contractAddress,
    role,
    reporter,
    trustedForwarder,
    dataHash,
    reportedChainId,
    transactionCount,
    nonce,
    deadline,
    windowBlockHash,
  ]);

  const review = useMemo(() => {
    if (!enabled || !hasChecked || nonce === undefined || deadline === undefined) return null;
    return reviewRelayedSignature({
      recoveredSigner,
      // pairedWallet, never the prop — see the wallet hook.
      expectedSigner: pairedWallet,
      signatureNonce: nonce,
      onChainNonce,
      deadline,
      nowSeconds,
      windowBlock,
      currentBlock,
    });
  }, [
    enabled,
    hasChecked,
    recoveredSigner,
    pairedWallet,
    nonce,
    onChainNonce,
    deadline,
    nowSeconds,
    windowBlock,
    currentBlock,
  ]);

  return { review, isChecking };
}
