/**
 * Acknowledgement payment step.
 *
 * Submits the acknowledgement transaction using the stored signature.
 */

import { useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import {
  TransactionCard,
  type TransactionStatus,
  type SignedMessageData,
} from '@/components/composed/TransactionCard';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useAcknowledgement } from '@/hooks/useAcknowledgement';
import { useTransactionCost } from '@/hooks/useTransactionCost';
import { getSignature, removeSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { isSignatureInvalidatingError } from '@/lib/errors/signatureInvalidation';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import type { WalletAcknowledgeArgs } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { getExplorerTxUrl } from '@/lib/explorer';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRegistryQueries } from '@/lib/contracts/queryKeys';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface AcknowledgementPayStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Acknowledgement payment step - submits the ACK transaction.
 */
export function AcknowledgementPayStep({ onComplete }: AcknowledgementPayStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registrationType, setAcknowledgementHash } = useRegistrationStore();
  const { registeree, relayer } = useFormStore();

  const isSelfRelay = registrationType === 'selfRelay';

  // Expected wallet for this step
  const expectedWallet = isSelfRelay ? relayer : registeree;

  // Check if correct wallet is connected
  const isCorrectWallet = Boolean(
    address && expectedWallet && areAddressesEqual(address, expectedWallet)
  );

  // Contract hook
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

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // See handleRetry: some reverts make the stored signature permanently unusable, so Retry
  // has to mean "sign again", not "submit the same bytes again".
  const { goToPreviousStep } = useStepNavigation();
  const needsResign = isError && isSignatureInvalidatingError(error);

  // Determine forwarder: for standard registration, it's the same as registeree
  // For self-relay, it's the relayer wallet
  const forwarder = isSelfRelay && relayer ? relayer : registeree;

  // Get stored signature, bound to the forwarder it was signed over. If the user went back
  // and edited the gas wallet after signing, the cached signature no longer matches the
  // struct the contract will verify, so it is treated as absent and the user is sent back to
  // sign rather than being shown an opaque on-chain revert.
  const storedSignature =
    registeree && forwarder
      ? getSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT, forwarder)
      : null;

  // Parse signature once for reuse (avoid calling parseSignature 4 times)
  const parsedSig = storedSignature ? parseSignature(storedSignature.signature) : null;

  // Build transaction args for gas estimation (needs to be before early returns)
  // Unified: acknowledge(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce, v, r, s)
  const transactionArgs: WalletAcknowledgeArgs | undefined =
    storedSignature &&
    registeree &&
    forwarder &&
    parsedSig &&
    storedSignature.reportedChainId !== undefined &&
    storedSignature.incidentTimestamp !== undefined &&
    storedSignature.nonce !== undefined
      ? ([
          registeree,
          forwarder,
          storedSignature.reportedChainId,
          storedSignature.incidentTimestamp,
          storedSignature.deadline,
          storedSignature.nonce,
          parsedSig.v,
          parsedSig.r,
          parsedSig.s,
        ] as const satisfies WalletAcknowledgeArgs)
      : undefined;

  // Get transaction cost estimate (must be called unconditionally - hooks rule)
  const costEstimate = useTransactionCost({
    step: 'acknowledgement',
    args: transactionArgs,
    ownerAddress: registeree,
  });

  // Refresh every registry-derived cache the moment the transaction confirms. Without this
  // the nonce, deadlines and registration status keep serving pre-transaction values to the
  // next step — the root cause of the stale-nonce bugs that sign-time refetches only papered
  // over. Broad by design: after a confirmation, all of those reads are suspect.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isConfirmed || !hash) return;
    invalidateRegistryQueries(queryClient, { step: 'acknowledgement', hash });
  }, [isConfirmed, hash, queryClient]);

  // Map hook state to TransactionStatus
  const getStatus = (): TransactionStatus => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending || isSubmitting) return 'submitting';
    if (isError || localError) return 'failed';
    return 'idle';
  };

  // Handle confirmed transaction
  useEffect(() => {
    if (isConfirmed && hash) {
      logger.contract.info('Acknowledgement transaction confirmed', {
        hash,
        registeree,
        registrationType,
      });
      setAcknowledgementHash(hash, chainId);
      logger.acknowledgement.info('Acknowledgement complete, advancing to grace period');
      // Advance to next step after delay to let user see success
      const timerId = setTimeout(onComplete, 3000);
      return () => clearTimeout(timerId);
    }
  }, [
    isConfirmed,
    hash,
    setAcknowledgementHash,
    chainId,
    onComplete,
    registeree,
    registrationType,
  ]);

  /**
   * Submit the acknowledgement transaction.
   */
  const handleSubmit = async () => {
    logger.contract.info('Acknowledgement transaction submission initiated', {
      registeree,
      hasStoredSignature: !!storedSignature,
      registrationType,
      connectedWallet: address,
      expectedWallet,
      isCorrectWallet,
    });

    if (!storedSignature || !registeree || !forwarder || !parsedSig) {
      logger.contract.error('Cannot submit acknowledgement - missing data', {
        hasStoredSignature: !!storedSignature,
        hasParsedSig: !!parsedSig,
        registeree,
        forwarder,
      });
      setLocalError('Missing signature data. Please go back and sign again.');
      return;
    }

    // Required fields guard - guard against missing data instead of silent fallback
    if (
      storedSignature.reportedChainId === undefined ||
      storedSignature.incidentTimestamp === undefined ||
      storedSignature.nonce === undefined ||
      storedSignature.deadline === undefined
    ) {
      logger.contract.error('Cannot submit acknowledgement - missing required fields', {
        hasReportedChainId: storedSignature.reportedChainId !== undefined,
        hasIncidentTimestamp: storedSignature.incidentTimestamp !== undefined,
        hasNonce: storedSignature.nonce !== undefined,
        hasDeadline: storedSignature.deadline !== undefined,
      });
      setLocalError('Signature is missing required data. Please go back and sign again.');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      // parsedSig already computed at component level (reused here)
      logger.contract.info('Submitting acknowledgementOfRegistry to contract', {
        deadline: storedSignature.deadline.toString(),
        nonce: storedSignature.nonce.toString(),
        registeree,
        signatureV: parsedSig.v,
        chainId,
      });

      await submitAcknowledgement({
        registeree,
        trustedForwarder: forwarder,
        reportedChainId: storedSignature.reportedChainId,
        incidentTimestamp: storedSignature.incidentTimestamp,
        deadline: storedSignature.deadline,
        nonce: storedSignature.nonce,
        signature: parsedSig,
      });

      logger.contract.info('Acknowledgement transaction submitted, waiting for confirmation');
    } catch (err) {
      logger.contract.error(
        'Acknowledgement transaction failed',
        {
          error: err instanceof Error ? err.message : String(err),
          registeree,
        },
        err instanceof Error ? err : undefined
      );
      setLocalError(sanitizeErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle retry after failure.
   *
   * Plain retry for anything a resubmit can fix. For a signature-invalidating revert
   * (expired deadline, consumed nonce, expired forwarder) the cached signature is discarded
   * and the user is sent back to sign — retrying it would resubmit identical bytes forever.
   */
  const handleRetry = () => {
    if (needsResign) {
      logger.acknowledgement.warn(
        'Acknowledgement signature invalidated by revert, returning to sign',
        { registeree, error: error?.message }
      );
      if (registeree) {
        removeSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);
      }
      reset();
      setLocalError(null);
      goToPreviousStep();
      return;
    }

    reset();
    setLocalError(null);
  };

  // Not connected
  if (!address) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Please connect your wallet to continue.</AlertDescription>
      </Alert>
    );
  }

  // Missing form data
  if (!registeree || !expectedWallet) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Missing registration data. Please start over from the beginning.
        </AlertDescription>
      </Alert>
    );
  }

  // Missing signature
  if (!storedSignature) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Signature not found. Please go back and sign the acknowledgement again.
        </AlertDescription>
      </Alert>
    );
  }

  // Get explorer URL
  const explorerUrl = hash ? getExplorerTxUrl(chainId, hash) : null;

  // Get error message - sanitize both local errors and hook errors
  const errorMessage = localError || (error ? sanitizeErrorMessage(error) : null);

  // Build signed message data for display (guard all required fields to prevent .toString() crash)
  const signedMessageData: SignedMessageData | null =
    storedSignature &&
    forwarder &&
    storedSignature.nonce !== undefined &&
    storedSignature.deadline !== undefined
      ? {
          registeree,
          trustedForwarder: forwarder,
          nonce: storedSignature.nonce,
          deadline: storedSignature.deadline,
          signature: storedSignature.signature,
        }
      : null;

  return (
    <div className="space-y-4">
      {/* Wallet switch prompt (self-relay only) */}
      {isSelfRelay && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={expectedWallet}
          expectedLabel="Gas Wallet"
          currentLabel="Stolen Wallet"
          currentChainId={chainId}
          expectedChainId={chainId}
        />
      )}

      {/* A signature-invalidating revert cannot be retried — say so before they press it */}
      {needsResign && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This signature can no longer be used. Retry will take you back to sign a new one.
          </AlertDescription>
        </Alert>
      )}

      {/* Transaction card with integrated cost estimate */}
      <TransactionCard
        type="acknowledgement"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
        costEstimate={costEstimate}
        chainId={chainId}
        onSubmit={handleSubmit}
        onRetry={handleRetry}
        disabled={!isCorrectWallet}
      />

      {/* Disabled state message when wrong wallet */}
      {!isCorrectWallet && getStatus() === 'idle' && (
        <p className="text-sm text-muted-foreground text-center">
          Switch to the correct wallet above to submit the transaction.
        </p>
      )}
    </div>
  );
}
