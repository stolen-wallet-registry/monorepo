/**
 * "Review before you pay" checks for a relayer holding a signature it received over P2P.
 *
 * Recovers the signer from the EIP-712 digest, re-reads the nonce from the contract, and
 * checks the deadline against the wall clock. All of it is defence in depth — the contract
 * enforces every one of these on-chain — but the relayer is the one spending gas, so it
 * should find out first, and should be able to see who it is paying for.
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
import type { SignatureStep, TxSignatureStep } from '@swr/signatures';
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

/** Wall clock in unix seconds, re-read on an interval so an expiring deadline is noticed. */
function useNowSeconds(enabled: boolean): bigint {
  const [nowSeconds, setNowSeconds] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(
      () => setNowSeconds(BigInt(Math.floor(Date.now() / 1000))),
      CLOCK_TICK_MS
    );
    return () => clearInterval(id);
  }, [enabled]);

  return nowSeconds;
}

export interface UseRelayedWalletSignatureReviewParams {
  /** Only run for the relayer role, and only once a signature is in hand. */
  enabled: boolean;
  step: SignatureStep;
  storedSignature: StoredSignature | null;
  /** Who the relayer believes it is paying for. */
  expectedSigner: Address | null | undefined;
  /** The relayer's own address — the forwarder named in the signed struct. */
  trustedForwarder: Address | undefined;
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
}: UseRelayedWalletSignatureReviewParams): UseRelayedSignatureReviewResult {
  const chainId = useChainId();
  const { address: contractAddress, role } = resolveRegistryContract(
    chainId,
    'wallet',
    'useRelayedWalletSignatureReview'
  );
  const { nonce: onChainNonce } = useContractNonce(
    enabled && expectedSigner ? expectedSigner : undefined,
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

  useEffect(() => {
    if (
      !enabled ||
      !signature ||
      !contractAddress ||
      !wallet ||
      !trustedForwarder ||
      reportedChainId === undefined ||
      incidentTimestamp === undefined ||
      nonce === undefined ||
      deadline === undefined
    ) {
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
    })
      .then((recovered) => {
        if (cancelled) return;
        setRecoveredSigner(recovered);
        setHasChecked(true);
        logger.signature.info('Recovered signer for relayed wallet signature', {
          step,
          recovered,
          expectedSigner,
        });
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
  ]);

  const review = useMemo(() => {
    if (!enabled || !hasChecked || nonce === undefined || deadline === undefined) return null;
    return reviewRelayedSignature({
      recoveredSigner,
      expectedSigner,
      signatureNonce: nonce,
      onChainNonce,
      deadline,
      nowSeconds,
    });
  }, [
    enabled,
    hasChecked,
    recoveredSigner,
    expectedSigner,
    nonce,
    onChainNonce,
    deadline,
    nowSeconds,
  ]);

  return { review, isChecking };
}

export interface UseRelayedTxSignatureReviewParams {
  enabled: boolean;
  step: TxSignatureStep;
  storedSignature: StoredTxSignature | null | undefined;
  expectedSigner: Address | null | undefined;
  trustedForwarder: Address | undefined;
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
}: UseRelayedTxSignatureReviewParams): UseRelayedSignatureReviewResult {
  const chainId = useChainId();
  const { address: contractAddress, role } = resolveRegistryContract(
    chainId,
    'transaction',
    'useRelayedTxSignatureReview'
  );
  const { nonce: onChainNonce } = useTxContractNonce(
    enabled && expectedSigner ? expectedSigner : undefined
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

  useEffect(() => {
    if (
      !enabled ||
      !signature ||
      !contractAddress ||
      !reporter ||
      !trustedForwarder ||
      !dataHash ||
      !reportedChainId ||
      transactionCount === undefined ||
      nonce === undefined ||
      deadline === undefined
    ) {
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
    })
      .then((recovered) => {
        if (cancelled) return;
        setRecoveredSigner(recovered);
        setHasChecked(true);
        logger.signature.info('Recovered signer for relayed transaction signature', {
          step,
          recovered,
          expectedSigner,
        });
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
  ]);

  const review = useMemo(() => {
    if (!enabled || !hasChecked || nonce === undefined || deadline === undefined) return null;
    return reviewRelayedSignature({
      recoveredSigner,
      expectedSigner,
      signatureNonce: nonce,
      onChainNonce,
      deadline,
      nowSeconds,
    });
  }, [
    enabled,
    hasChecked,
    recoveredSigner,
    expectedSigner,
    nonce,
    onChainNonce,
    deadline,
    nowSeconds,
  ]);

  return { review, isChecking };
}
