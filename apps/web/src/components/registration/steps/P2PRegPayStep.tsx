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
import { WaitingForData } from '@/components/p2p';
import { Alert, AlertDescription, Button } from '@swr/ui';
import { useRegistration } from '@/hooks/useRegistration';
import { useQuoteRegistration } from '@/hooks/useQuoteRegistration';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import type { Hash } from '@/lib/types/ethereum';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { extractBridgeMessageId } from '@/lib/bridge/messageId';
import { needsCrossChainConfirmation } from '@/hooks/useCrossChainConfirmation';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';

/** Maximum number of automatic retries for sending hash */
const MAX_AUTO_RETRIES = 3;
/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 1000;

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
  const { registrationHash, registrationChainId, setRegistrationHash, setBridgeMessageId } =
    useRegistrationStore();
  const [hasSentHash, setHasSentHash] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get stored signature (relayer only)
  const storedSig =
    role === 'relayer' && registeree
      ? getSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION)
      : null;

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

  // Check if cross-chain (for message ID extraction)
  const isCrossChain = needsCrossChainConfirmation(chainId);

  // Derive TransactionCard status
  const getStatus = (): TransactionStatus => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending) return 'submitting';
    if (isError) return 'failed';
    return 'idle';
  };

  // Relayer: Submit registration transaction
  const handleSubmit = useCallback(async () => {
    if (!storedSig || !registeree) {
      return;
    }

    if (!relayerAddress) {
      logger.p2p.error('Cannot submit REG - relayer wallet not connected');
      return;
    }

    if (
      storedSig.reportedChainId === undefined ||
      storedSig.incidentTimestamp === undefined ||
      storedSig.nonce === undefined ||
      storedSig.deadline === undefined
    ) {
      logger.p2p.error('Cannot submit REG - missing required signature fields', {
        hasReportedChainId: storedSig.reportedChainId !== undefined,
        hasIncidentTimestamp: storedSig.incidentTimestamp !== undefined,
        hasNonce: storedSig.nonce !== undefined,
        hasDeadline: storedSig.deadline !== undefined,
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
      forwarder: relayerAddress,
      reportedChainId,
      incidentTimestamp,
      deadline: storedSig.deadline,
      nonce: storedSig.nonce,
      signature: parsedSig,
      feeWei,
    });
  }, [storedSig, registeree, relayerAddress, submitRegistration, feeWei]);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Relayer: Store registration hash when confirmed (for success step display)
  useEffect(() => {
    if (role === 'relayer' && isConfirmed && hash && !registrationHash) {
      setRegistrationHash(hash as Hash, chainId);
      logger.p2p.info('Relayer stored REG hash for success display', { hash, chainId });
    }
  }, [role, isConfirmed, hash, registrationHash, setRegistrationHash, chainId]);

  // Relayer: Send tx hash (and bridge message ID if cross-chain) to registeree after confirmation
  useEffect(() => {
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
        await passStreamData({
          connection,
          protocols: [PROTOCOLS.REG_PAY],
          // Include chainId so registeree uses correct explorer links
          // Convert null to undefined for optional fields
          streamData: { hash, messageId: messageId ?? undefined, txChainId: chainId },
        });

        setHasSentHash(true);
        logger.p2p.info('Sent REG tx hash to registeree', { hash, messageId });
        onComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send hash';
        logger.p2p.error('Failed to send REG tx hash', { attempt: retryCount + 1 }, err as Error);

        // Auto-retry with exponential backoff
        if (retryCount < MAX_AUTO_RETRIES) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
          logger.p2p.info('Scheduling retry', { attempt: retryCount + 2, delay });
          retryTimeoutRef.current = setTimeout(() => {
            setRetryCount((prev) => prev + 1);
          }, delay);
        } else {
          // Max retries exceeded, show error to user
          setSendError(message);
          logger.p2p.error('Max retries exceeded for sending REG tx hash', { hash });
        }
      }
    };

    sendHash();
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
    onComplete,
    setBridgeMessageId,
  ]);

  // Manual retry handler for user-initiated resend
  const handleResendHash = useCallback(() => {
    // Clear any pending auto-retry to avoid duplicate attempts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setSendError(null);
    setRetryCount((prev) => prev + 1);
  }, []);

  // Registeree: Wait for hash and auto-advance
  useEffect(() => {
    if (role === 'registeree' && registrationHash) {
      logger.p2p.info('Registeree received REG tx hash, advancing');
      onComplete();
    }
  }, [role, registrationHash, onComplete]);

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
                  forwarder: relayerAddress,
                  nonce: storedSig.nonce,
                  deadline: storedSig.deadline,
                  chainId: storedSig.chainId,
                }}
              />
            )}

          <TransactionCard
            type="registration"
            status={getStatus()}
            hash={hash}
            error={error ? sanitizeErrorMessage(error) : null}
            chainId={chainId}
            onSubmit={handleSubmit}
            onRetry={reset}
            disabled={!storedSig}
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
