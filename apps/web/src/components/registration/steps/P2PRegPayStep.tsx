/**
 * P2P Registration Pay Step.
 *
 * - Relayer: Receives signature and submits registration transaction
 * - Registeree: Waits for relayer to submit transaction
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { TransactionCard, type TransactionStatus } from '@/components/composed/TransactionCard';
import { SignatureDetails } from '@/components/composed/SignatureDetails';
import { RelayedSignatureReview } from '@/components/composed/RelayedSignatureReview';
import { useRelayedWalletSignatureReview } from '@/hooks/p2p/useRelayedSignatureReview';
import { WaitingForData, P2PWaitForConfirmation } from '@/components/p2p';
import { Alert, AlertDescription, Button } from '@swr/ui';
import { useRegistration } from '@/hooks/useRegistration';
import { useQuoteRegistration } from '@/hooks/useQuoteRegistration';
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { getSignature, removeSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { SignatureInvalidatedAlert } from '@/components/registration/SignatureInvalidatedAlert';
import { classifyP2PRetry, sendResignRequest } from '@/components/registration/p2pResignRequest';
import type { Hash } from '@/lib/types/ethereum';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { applyScheduledRetry, backoffDelay, MAX_AUTO_RETRIES } from '@/lib/p2p/retryBackoff';
import { useP2PStore } from '@/stores/p2pStore';
import { extractBridgeMessageId } from '@/lib/bridge/messageId';
import {
  useCrossChainConfirmation,
  needsCrossChainConfirmation,
} from '@/hooks/useCrossChainConfirmation';
import { getHubChainId } from '@/lib/chains/config';
import { getChainName, getBridgeMessageByIdUrl } from '@/lib/explorer';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRegistryQueries } from '@/lib/contracts/queryKeys';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';

export interface P2PRegPayStepProps {
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
 * P2P step for registration payment.
 */
export function P2PRegPayStep({ onComplete, role, getLibp2p }: P2PRegPayStepProps) {
  const chainId = useChainId();
  const { address: relayerAddress } = useAccount();
  const { registeree } = useFormStore();
  const { partnerPeerId } = useP2PStore();
  const {
    registrationHash,
    registrationChainId,
    bridgeMessageId,
    setRegistrationHash,
    setBridgeMessageId,
  } = useRegistrationStore();
  const { goToStep } = useStepNavigation();
  const [hasSentHash, setHasSentHash] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /**
   * Set once Retry has discarded a dead signature. `notified` records whether the registeree
   * actually got the request; until it is true the relayer stays on this step so a delivery
   * failure is visible rather than being swallowed by a step transition.
   */
  const [resignRequest, setResignRequest] = useState<{
    notified: boolean | null;
    windowClosed: boolean;
  } | null>(null);
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

  // Latch recording that the step already advanced. Three separate paths can advance this
  // step (local-chain send completing, hub confirming a cross-chain delivery, registeree
  // receiving the hash) and they are only mutually exclusive by role and chain kind.
  // Advancing a registration step twice skips a step of the two-phase flow, so the latch
  // makes single-firing structural instead of a property of those guard conditions.
  // `logAdvance` runs only on the firing call so retries don't spam the log.
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
      ? getSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION, relayerAddress)
      : null;

  // Defence in depth before spending gas: recover the signer from the EIP-712 digest,
  // re-read the nonce from the contract, and check the deadline. The contract enforces all
  // of this too — this is so the relayer finds out first, and can see who it is paying for.
  const { review: signatureReview, isChecking: isReviewingSignature } =
    useRelayedWalletSignatureReview({
      enabled: role === 'relayer' && !!storedSig,
      step: SIGNATURE_STEP.REGISTRATION,
      storedSignature: storedSig,
      expectedSigner: registeree,
      trustedForwarder: relayerAddress,
    });

  // Registration submission hook (relayer only)
  const { submitRegistration, hash, isPending, isConfirming, isConfirmed, isError, error, reset } =
    useRegistration();

  // Get protocol fee (chain-aware - works on hub and spoke)
  const { feeWei } = useQuoteRegistration(registeree);

  // Get transaction receipt for bridge message ID extraction (relayer only)
  const { data: receipt } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: role === 'relayer' && !!hash },
  });

  // Check if cross-chain (for message ID extraction and hub polling)
  const isCrossChain = needsCrossChainConfirmation(chainId);
  const hubChainId = isCrossChain ? getHubChainId(chainId) : undefined;

  // Relayer: Poll hub chain for cross-chain confirmation after sending hash
  const crossChain = useCrossChainConfirmation({
    wallet: registeree ?? undefined,
    spokeChainId: chainId,
    enabled: role === 'relayer' && isCrossChain && hasSentHash,
    pollInterval: 3000,
    maxPollingTime: 120000,
  });

  // Relayer: Advance to success when hub confirms cross-chain delivery.
  // The confirmation arrives from a poll inside useCrossChainConfirmation, so there is no
  // handler to hang the advance off — this genuinely reacts to polled state converging.
  // Routing through `advanceOnce` matters here in particular: `crossChain.elapsedTime`
  // keeps ticking, so the effect re-runs while the status stays 'confirmed'.
  useEffect(() => {
    if (role === 'relayer' && isCrossChain && crossChain.status === 'confirmed') {
      advanceOnce(() =>
        logger.registration.info('Relayer cross-chain confirmation received, advancing', {
          wallet: registeree,
          elapsedTime: crossChain.elapsedTime,
        })
      );
    }
  }, [role, isCrossChain, crossChain.status, crossChain.elapsedTime, registeree, advanceOnce]);

  // Refresh every registry-derived cache the moment the transaction confirms. Without this
  // the nonce, deadlines and registration status keep serving pre-transaction values to the
  // next step — the root cause of the stale-nonce bugs that sign-time refetches only papered
  // over. Broad by design: after a confirmation, all of those reads are suspect.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isConfirmed || !hash) return;
    invalidateRegistryQueries(queryClient, { step: 'registration', hash });
  }, [isConfirmed, hash, queryClient]);

  // Derive TransactionCard status
  const getStatus = (): TransactionStatus => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending) return 'submitting';
    if (isError) return 'failed';
    return 'idle';
  };

  // The contract reuses DeadlineExpired for two distinct failures: a stale signature
  // timestamp (the registeree can fix that by signing again) and an acknowledgement window
  // that closed on-chain (no registration signature can fix that — the acknowledgement
  // itself has to be redone). Zeroed deadlines mean there is no pending acknowledgement at
  // all, and the contract reports those as expired too, so they do not count as closed.
  const { data: deadlines } = useContractDeadlines(
    role === 'relayer' ? (registeree ?? undefined) : undefined
  );
  const hasNoPendingAck =
    deadlines !== undefined && deadlines.start === 0n && deadlines.expiry === 0n;
  const windowClosed = deadlines !== undefined && !hasNoPendingAck && deadlines.isExpired;

  // `onRetry={reset}` rebuilt byte-identical calldata from the same cached signature and
  // reverted identically, forever. On this path the relayer cannot break the loop by
  // re-signing either — the signature belongs to the registeree, on another machine.
  const retryAction = classifyP2PRetry({ isError, error, windowClosed });
  const needsResign = retryAction.kind === 'request-resign';

  /**
   * Move back to the step at which a fresh signature from the registeree is accepted.
   *
   * `isRelayerProtocolExpectedAtStep` admits `REG_SIG` only at `register-and-sign` and
   * `ACK_SIG` only at `acknowledge-and-sign`. Staying on `registration-payment` would have
   * the relayer drop the very message it just asked for.
   */
  const returnToAwaitingSignature = useCallback(
    (restartFromAcknowledgement: boolean) => {
      setResignRequest(null);
      goToStep(restartFromAcknowledgement ? 'acknowledge-and-sign' : 'register-and-sign');
    },
    [goToStep]
  );

  /**
   * Retry after a failure.
   *
   * Plain resubmit for anything a resubmit can fix. For a signature-invalidating revert the
   * relayed signature is dropped — so nothing on screen can resubmit it — and the registeree
   * is asked over P2P to sign again. A closed window additionally discards the
   * acknowledgement signature, whose nonce is spent, and restarts the two-phase flow: the
   * window check is never bypassed, only recovered from.
   */
  const handleRetry = useCallback(() => {
    if (retryAction.kind !== 'request-resign') {
      reset();
      return;
    }

    const restartFromAck = retryAction.discardAcknowledgement;

    if (registeree) {
      removeSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION);
      if (restartFromAck) {
        removeSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);
      }
    }
    reset();
    setResignRequest({ notified: null, windowClosed: restartFromAck });

    logger.registration.warn(
      restartFromAck
        ? 'Registration window closed on-chain; asking the registeree to restart from acknowledgement'
        : 'Relayed registration signature invalidated by revert; requesting a new one from the registeree',
      { registeree, windowClosed: restartFromAck, error: error?.message }
    );

    void sendResignRequest({
      getLibp2p,
      partnerPeerId,
      reason: retryAction.reason,
      flow: 'wallet',
    }).then((notified) => {
      setResignRequest({ notified, windowClosed: restartFromAck });
      if (notified) {
        returnToAwaitingSignature(restartFromAck);
      }
    });
  }, [
    retryAction,
    registeree,
    chainId,
    reset,
    error,
    getLibp2p,
    partnerPeerId,
    returnToAwaitingSignature,
  ]);

  // Relayer: Submit registration transaction
  const handleSubmit = useCallback(async () => {
    if (!storedSig || !registeree) {
      return;
    }

    if (!relayerAddress) {
      logger.p2p.error('Cannot submit REG - relayer wallet not connected');
      return;
    }

    // Belt and braces: the button is disabled while the review is failing, but a stale click
    // must not be able to spend the relayer's gas on an unverified signature.
    if (!signatureReview?.ok) {
      logger.p2p.warn('Blocked REG submission: relayed signature did not pass verification', {
        issues: signatureReview?.issues,
      });
      return;
    }

    if (
      storedSig.reportedChainId === undefined ||
      storedSig.incidentTimestamp === undefined ||
      storedSig.nonce === undefined ||
      storedSig.deadline === undefined ||
      // Signed over blockhash(windowBlock); the peer must have sent the number with it.
      storedSig.windowBlock === undefined
    ) {
      logger.p2p.error('Cannot submit REG - missing required signature fields', {
        hasReportedChainId: storedSig.reportedChainId !== undefined,
        hasIncidentTimestamp: storedSig.incidentTimestamp !== undefined,
        hasNonce: storedSig.nonce !== undefined,
        hasDeadline: storedSig.deadline !== undefined,
        hasWindowBlock: storedSig.windowBlock !== undefined,
      });
      return;
    }

    if (feeWei === undefined) {
      logger.p2p.error('Cannot submit registration - fee quote unavailable', {
        registeree,
      });
      return;
    }

    logger.p2p.info('Relayer submitting REG transaction');

    // Parse signature to v, r, s components
    const parsedSig = parseSignature(storedSig.signature);

    // reportedChainId is raw uint64 chain ID — contract converts to CAIP-2 hash internally
    const reportedChainId = storedSig.reportedChainId;
    const incidentTimestamp = storedSig.incidentTimestamp;

    await submitRegistration({
      registeree,
      trustedForwarder: relayerAddress,
      reportedChainId,
      incidentTimestamp,
      deadline: storedSig.deadline,
      nonce: storedSig.nonce,
      windowBlock: storedSig.windowBlock,
      signature: parsedSig,
      feeWei,
    });
  }, [storedSig, registeree, relayerAddress, submitRegistration, feeWei, signatureReview]);

  // Relayer: Store registration hash when confirmed (for success step display)
  useEffect(() => {
    if (role === 'relayer' && isConfirmed && hash && !registrationHash) {
      setRegistrationHash(hash as Hash, chainId);
      logger.p2p.info('Relayer stored REG hash for success display', { hash, chainId });
    }
  }, [role, isConfirmed, hash, registrationHash, setRegistrationHash, chainId]);

  // Relayer: Send tx hash (and bridge message ID if cross-chain) to registeree after confirmation
  useEffect(() => {
    // Extracting the bridge message id, dialing the peer, and writing the stream are all
    // slow. If this effect re-runs or the step unmounts mid-flight, the continuation must
    // not write state belonging to a superseded attempt.
    let cancelled = false;

    const sendHash = async () => {
      const libp2p = getLibp2p();
      if (role !== 'relayer' || !isConfirmed || !hash || !libp2p || !partnerPeerId || hasSentHash) {
        return;
      }

      // For cross-chain, wait for receipt to extract message ID
      // For local chain, proceed without waiting
      if (isCrossChain && !receipt) {
        logger.p2p.debug('Waiting for receipt to extract bridge message ID');
        return;
      }

      try {
        setSendError(null);

        // Extract bridge message ID if cross-chain
        let messageId: Hash | null = null;
        if (isCrossChain && receipt?.logs) {
          messageId = await extractBridgeMessageId(receipt.logs);
          if (cancelled) return;
          if (messageId) {
            logger.p2p.info('Extracted bridge message ID for P2P', { messageId });
            // Store locally for relayer's success step too
            setBridgeMessageId(messageId);
          }
        }

        logger.p2p.info('Attempting to send REG tx hash', {
          hash,
          messageId,
          attempt: retryCount + 1,
        });

        const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });
        if (cancelled) return;

        await passStreamData({
          connection,
          protocols: [PROTOCOLS.REG_PAY],
          // Include chainId so registeree uses correct explorer links
          // Convert null to undefined for optional fields
          streamData: { hash, messageId: messageId ?? undefined, txChainId: chainId },
        });
        if (cancelled) return;

        setHasSentHash(true);
        logger.p2p.info('Sent REG tx hash to registeree', { hash, messageId });
        // On spoke chains, don't advance yet — wait for hub confirmation
        if (!isCrossChain) {
          advanceOnce(() => logger.registration.info('Local chain — relayer advancing', { hash }));
        } else {
          logger.registration.info(
            'Spoke chain — relayer waiting for hub confirmation before advancing',
            { chainId }
          );
        }
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : 'Failed to send hash';
        logger.p2p.error('Failed to send REG tx hash', { attempt: retryCount + 1 }, err as Error);

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
          logger.p2p.error('Max retries exceeded for sending REG tx hash', { hash });
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
    receipt,
    isCrossChain,
    getLibp2p,
    partnerPeerId,
    hasSentHash,
    retryCount,
    advanceOnce,
    setBridgeMessageId,
  ]);

  // The backoff timer lives here, in the effect that both allocates and clears it, so it can
  // never outlive unmount.
  //
  // It is split out from the send effect on purpose. When the send effect owned the timer,
  // its cleanup fired on every re-run — a new `hash`, a new `receipt`, a new `partnerPeerId`,
  // `hasSentHash` flipping — and silently killed the auto-retry chain, stranding the user on
  // a send error with only the manual resend button. Keying this effect on the schedule alone
  // means unrelated re-runs leave a pending retry untouched, while unmount still clears it.
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
    if (role === 'registeree' && registrationHash) {
      advanceOnce(() => logger.p2p.info('Registeree received REG tx hash, advancing'));
    }
  }, [role, registrationHash, advanceOnce]);

  // Registeree view - waiting for relayer
  if (role === 'registeree') {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Your relayer is submitting the registration transaction. Please wait for confirmation...
          </AlertDescription>
        </Alert>

        {registrationHash ? (
          // TransactionCard hides submit button when status='confirmed' - onSubmit is unused but required by interface
          // Use registrationChainId from store (sent by relayer) for correct explorer links
          <TransactionCard
            type="registration"
            status="confirmed"
            hash={registrationHash}
            chainId={registrationChainId ?? chainId}
            onSubmit={() => undefined}
          />
        ) : (
          <WaitingForData
            message="Waiting for relayer to submit transaction..."
            waitingFor="registration transaction hash"
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
          You received the registration signature. Review the details below and submit the final
          transaction to complete the registration.
        </AlertDescription>
      </Alert>

      {/* Signature discarded after an invalidating revert: say what has to happen next, and
          whether the registeree was actually told. */}
      {resignRequest && (
        <>
          <SignatureInvalidatedAlert
            windowClosed={resignRequest.windowClosed}
            partner={{ notified: resignRequest.notified, role: 'registeree' }}
          />
          {resignRequest.notified === false && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => returnToAwaitingSignature(resignRequest.windowClosed)}
            >
              I&apos;ve asked them — wait for a new signature
            </Button>
          )}
        </>
      )}

      {!storedSig ? (
        <WaitingForData
          message="Waiting for signature from registeree..."
          waitingFor="registration signature"
        />
      ) : (
        <>
          {/* Show signature details for relayer to review */}
          {registeree &&
            relayerAddress &&
            storedSig.nonce !== undefined &&
            storedSig.deadline !== undefined && (
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

          {needsResign && (
            <SignatureInvalidatedAlert
              windowClosed={windowClosed}
              partner={{ notified: null, role: 'registeree' }}
            />
          )}

          <TransactionCard
            type="registration"
            status={getStatus()}
            hash={hash}
            error={error ? sanitizeErrorMessage(error) : null}
            chainId={chainId}
            onSubmit={handleSubmit}
            onRetry={handleRetry}
            disabled={!storedSig || !signatureReview?.ok}
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
          {/* Cross-chain: show Hyperlane tracking UI after hash is sent */}
          {isCrossChain && hasSentHash && crossChain.status !== 'confirmed' && (
            <P2PWaitForConfirmation
              status={crossChain.status}
              elapsedTime={crossChain.elapsedTime}
              onComplete={() => {
                /* handled by the useEffect above */
              }}
              waitingFor="cross-chain hub confirmation"
              logContext={{ wallet: registeree, elapsedTime: crossChain.elapsedTime }}
              crossChainProgress={{
                hubChainName: hubChainId ? getChainName(hubChainId) : undefined,
                bridgeName: 'Hyperlane',
                messageId: bridgeMessageId ?? undefined,
                explorerUrl: bridgeMessageId ? getBridgeMessageByIdUrl(bridgeMessageId) : null,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
