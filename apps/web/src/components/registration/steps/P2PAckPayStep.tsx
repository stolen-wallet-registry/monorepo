/**
 * P2P Acknowledgement Pay Step.
 *
 * - Relayer: Receives signature and submits acknowledgement transaction
 * - Registeree: Waits for relayer to submit transaction
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { TransactionCard, type TransactionStatus } from '@/components/composed/TransactionCard';
import { SignatureDetails } from '@/components/composed/SignatureDetails';
import { RelayedSignatureReview } from '@/components/composed/RelayedSignatureReview';
import { useRelayedWalletSignatureReview } from '@/hooks/p2p/useRelayedSignatureReview';
import { WaitingForData } from '@/components/p2p';
import { Alert, AlertDescription, Button } from '@swr/ui';
import { useAcknowledgement } from '@/hooks/useAcknowledgement';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import type { Hash } from '@/lib/types/ethereum';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { applyScheduledRetry, backoffDelay, MAX_AUTO_RETRIES } from '@/lib/p2p/retryBackoff';
import { useP2PStore } from '@/stores/p2pStore';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRegistryQueries } from '@/lib/contracts/queryKeys';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';

export interface P2PAckPayStepProps {
  /** Called when transaction is confirmed */
  onComplete: () => void;
  /** The role in P2P flow */
  role: 'registeree' | 'relayer';
  /**
   * Getter for the libp2p node instance.
   * IMPORTANT: Uses a getter function instead of passing libp2p directly.
   * libp2p uses a Proxy that throws MissingServiceError when unknown properties are accessed.
   * React DevTools tries to serialize props (accessing `$typeof`, etc.), which crashes the app.
   * Passing a getter function avoids this because functions aren't deeply inspected.
   */
  getLibp2p: () => Libp2p | null;
}

/**
 * P2P step for acknowledgement payment.
 */
export function P2PAckPayStep({ onComplete, role, getLibp2p }: P2PAckPayStepProps) {
  const chainId = useChainId();
  const { address: relayerAddress } = useAccount();
  const { registeree } = useFormStore();
  const { partnerPeerId } = useP2PStore();
  const { acknowledgementHash, setAcknowledgementHash } = useRegistrationStore();
  const [hasSentHash, setHasSentHash] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  /** Pending auto-retry: when it should fire, and which attempt it was scheduled from. */
  const [retrySchedule, setRetrySchedule] = useState<{ at: number; fromAttempt: number } | null>(
    null
  );

  // Latest-ref for the step-advance callback. Assigned in an effect rather than during
  // render: writing a ref while rendering is a side effect, and a render React discards
  // would leave this pointing at a callback from a render that never committed. No
  // dependency array — parents pass an inline arrow, so listing it would make the
  // dependency churn every render and re-arm every effect that advances the step.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // Latch recording that the step already advanced. Advancing a registration step twice
  // skips a step of the two-phase flow, so single-firing is made structurally impossible
  // here rather than relying on every call site's guard conditions staying mutually
  // exclusive. `logAdvance` runs only on the firing call so retries don't spam the log.
  const hasAdvancedRef = useRef(false);
  const advanceOnce = useCallback((logAdvance: () => void) => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    logAdvance();
    onCompleteRef.current();
  }, []);

  // Get stored signature (relayer only), bound to this relayer as the forwarder. The
  // registeree signed over the relayer's address; a signature naming anyone else would
  // revert on-chain after the relayer had already paid.
  const storedSig =
    role === 'relayer' && registeree && relayerAddress
      ? getSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT, relayerAddress)
      : null;

  // Defence in depth before spending gas: recover the signer from the EIP-712 digest,
  // re-read the nonce from the contract, and check the deadline. The contract enforces all
  // of this too — this is so the relayer finds out first, and can see who it is paying for.
  const { review: signatureReview, isChecking: isReviewingSignature } =
    useRelayedWalletSignatureReview({
      enabled: role === 'relayer' && !!storedSig,
      step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
      storedSignature: storedSig,
      expectedSigner: registeree,
      trustedForwarder: relayerAddress,
    });

  // Acknowledgement submission hook (relayer only)
  const {
    submitAcknowledgement,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    reset,
  } = useAcknowledgement();

  // Get protocol fee (chain-aware - works on hub and spoke)

  // Refresh every registry-derived cache the moment the transaction confirms. Without this
  // the nonce, deadlines and registration status keep serving pre-transaction values to the
  // next step — the root cause of the stale-nonce bugs that sign-time refetches only papered
  // over. Broad by design: after a confirmation, all of those reads are suspect.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isConfirmed || !hash) return;
    invalidateRegistryQueries(queryClient, { step: 'acknowledgement', hash });
  }, [isConfirmed, hash, queryClient]);

  // Derive TransactionCard status
  const getStatus = (): TransactionStatus => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending) return 'submitting';
    if (isError) return 'failed';
    return 'idle';
  };

  // Check if stored signature has required fields
  const hasRequiredFields = Boolean(
    storedSig?.reportedChainId !== undefined && storedSig?.incidentTimestamp !== undefined
  );

  // Relayer: Submit acknowledgement transaction
  const handleSubmit = useCallback(async () => {
    if (!storedSig || !registeree) {
      return;
    }

    // Relayer address is required for P2P
    if (!relayerAddress) {
      logger.p2p.error('Cannot submit ACK - relayer wallet not connected');
      return;
    }

    // Belt and braces: the button is disabled while the review is failing, but a stale click
    // must not be able to spend the relayer's gas on an unverified signature.
    if (!signatureReview?.ok) {
      logger.p2p.warn('Blocked ACK submission: relayed signature did not pass verification', {
        issues: signatureReview?.issues,
      });
      return;
    }

    logger.p2p.info('Relayer submitting ACK transaction');

    // Parse signature to v, r, s components
    const parsedSig = parseSignature(storedSig.signature);

    // P2P relay: relayer is the forwarder (contract derives isSponsored from wallet != forwarder)
    await submitAcknowledgement({
      registeree,
      trustedForwarder: relayerAddress,
      reportedChainId: storedSig.reportedChainId ?? BigInt(chainId),
      incidentTimestamp: storedSig.incidentTimestamp ?? 0n,
      deadline: storedSig.deadline,
      nonce: storedSig.nonce,
      signature: parsedSig,
    });
  }, [storedSig, registeree, relayerAddress, chainId, submitAcknowledgement, signatureReview]);

  // Relayer: Store acknowledgement hash when confirmed (for grace period display)
  useEffect(() => {
    if (role === 'relayer' && isConfirmed && hash && !acknowledgementHash) {
      setAcknowledgementHash(hash as Hash, chainId);
      logger.p2p.info('Relayer stored ACK hash for grace period display', { hash, chainId });
    }
  }, [role, isConfirmed, hash, acknowledgementHash, setAcknowledgementHash, chainId]);

  // Relayer: Send tx hash to registeree after confirmation with retry logic
  useEffect(() => {
    // Dialing a peer and writing a stream are slow. If this effect re-runs or the step
    // unmounts while that is in flight, the continuation must not write state belonging to
    // a superseded attempt — two overlapping sends could otherwise resolve out of order and
    // leave hasSentHash/sendError describing the wrong one.
    let cancelled = false;

    const sendHash = async () => {
      const libp2p = getLibp2p();
      if (role !== 'relayer' || !isConfirmed || !hash || !libp2p || !partnerPeerId || hasSentHash) {
        return;
      }

      try {
        setSendError(null);
        logger.p2p.info('Attempting to send ACK tx hash', { hash, attempt: retryCount + 1 });

        const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });
        if (cancelled) return;

        await passStreamData({
          connection,
          protocols: [PROTOCOLS.ACK_PAY],
          // Include chainId so registeree uses correct explorer links
          streamData: { hash, txChainId: chainId },
        });
        if (cancelled) return;

        setHasSentHash(true);
        advanceOnce(() => logger.p2p.info('Sent ACK tx hash to registeree', { hash }));
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : 'Failed to send hash';
        logger.p2p.error('Failed to send ACK tx hash', { attempt: retryCount + 1 }, err as Error);

        // Auto-retry with exponential backoff. This effect only RECORDS the intent to retry;
        // the timer itself is owned by the dedicated effect below, which allocates and clears
        // it together. See that effect for why the split matters.
        if (retryCount < MAX_AUTO_RETRIES) {
          const delay = backoffDelay(retryCount);
          logger.p2p.info('Scheduling retry', { attempt: retryCount + 2, delay });
          setRetrySchedule({ at: Date.now() + delay, fromAttempt: retryCount });
        } else {
          // Max retries exceeded, show error to user
          setSendError(message);
          logger.p2p.error('Max retries exceeded for sending ACK tx hash', { hash });
        }
      }
    };

    sendHash();

    // Only the in-flight send is cancelled here — this effect no longer owns a timer at all.
    return () => {
      cancelled = true;
    };
  }, [
    role,
    isConfirmed,
    hash,
    chainId,
    getLibp2p,
    partnerPeerId,
    hasSentHash,
    retryCount,
    advanceOnce,
  ]);

  // The backoff timer lives here, in the effect that both allocates and clears it, so it can
  // never outlive unmount.
  //
  // It is split out from the send effect on purpose. When the send effect owned the timer,
  // its cleanup fired on every re-run — a new `hash`, a new `partnerPeerId`, `hasSentHash`
  // flipping — and silently killed the auto-retry chain, stranding the user on a send error
  // with only the manual resend button. Keying this effect on the schedule alone means
  // unrelated re-runs leave a pending retry untouched, while unmount still clears it.
  //
  // `applyScheduledRetry` guards the increment against a schedule the user has already
  // superseded with a manual resend.
  useEffect(() => {
    if (!retrySchedule) return;

    const timerId = setTimeout(
      () => {
        setRetrySchedule(null);
        setRetryCount((prev) => applyScheduledRetry(prev, retrySchedule.fromAttempt));
      },
      Math.max(0, retrySchedule.at - Date.now())
    );

    return () => clearTimeout(timerId);
  }, [retrySchedule]);

  // Manual retry handler for user-initiated resend
  const handleResendHash = useCallback(() => {
    // Drop any pending auto-retry to avoid duplicate attempts
    setRetrySchedule(null);
    setSendError(null);
    setRetryCount((prev) => prev + 1);
  }, []);

  // Registeree: Wait for hash and auto-advance.
  // This one genuinely reacts to state converging rather than to an event: the hash
  // arrives on a libp2p stream handler that writes the store, so there is no local
  // handler to hang the advance off. The advance is routed through `advanceOnce`, so a
  // re-run (a relayer resend writing a different hash, StrictMode's double invoke) can
  // no longer advance the flow a second time.
  useEffect(() => {
    if (role === 'registeree' && acknowledgementHash) {
      advanceOnce(() => logger.p2p.info('Registeree received ACK tx hash, advancing'));
    }
  }, [role, acknowledgementHash, advanceOnce]);

  // Registeree view - waiting for relayer
  if (role === 'registeree') {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Your relayer is submitting the acknowledgement transaction. Please wait...
          </AlertDescription>
        </Alert>

        {acknowledgementHash ? (
          // TransactionCard hides submit button when status='confirmed' - onSubmit is unused but required by interface
          <TransactionCard
            type="acknowledgement"
            status="confirmed"
            hash={acknowledgementHash}
            chainId={chainId}
            onSubmit={() => undefined}
          />
        ) : (
          <WaitingForData
            message="Waiting for relayer to submit transaction..."
            waitingFor="acknowledgement transaction hash"
          />
        )}
      </div>
    );
  }

  // Relayer view - submit transaction
  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          You received the acknowledgement signature. Review the details below and submit the
          transaction to register on behalf of the stolen wallet owner.
        </AlertDescription>
      </Alert>

      {!storedSig ? (
        <WaitingForData
          message="Waiting for signature from registeree..."
          waitingFor="acknowledgement signature"
        />
      ) : (
        <>
          {/* Show signature details for relayer to review */}
          {registeree && relayerAddress && (
            <SignatureDetails
              data={{
                registeree,
                trustedForwarder: relayerAddress,
                nonce: storedSig.nonce,
                deadline: storedSig.deadline,
                chainId: storedSig.chainId,
              }}
            />
          )}

          {/* Review before you pay: recovered signer, nonce match, deadline countdown */}
          <RelayedSignatureReview
            review={signatureReview}
            isChecking={isReviewingSignature}
            expectedSigner={registeree}
            deadline={storedSig.deadline}
          />

          <TransactionCard
            type="acknowledgement"
            status={getStatus()}
            hash={hash}
            error={
              !hasRequiredFields && storedSig
                ? 'Signature is missing required data. Registeree may need to sign again.'
                : error
                  ? sanitizeErrorMessage(error)
                  : null
            }
            chainId={chainId}
            onSubmit={handleSubmit}
            onRetry={reset}
            disabled={!storedSig || !hasRequiredFields || !signatureReview?.ok}
          />
          {sendError && isConfirmed && !hasSentHash && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription className="flex items-center justify-between">
                <span>Failed to send hash to registeree: {sendError}</span>
                <Button variant="outline" size="sm" onClick={handleResendHash}>
                  Resend Hash
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
