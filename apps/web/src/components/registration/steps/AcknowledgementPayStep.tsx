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
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import type { WalletAcknowledgeArgs } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { getExplorerTxUrl } from '@/lib/explorer';
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

  // Get stored signature
  const storedSignature = registeree
    ? getSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)
    : null;

  // Parse signature once for reuse (avoid calling parseSignature 4 times)
  const parsedSig = storedSignature ? parseSignature(storedSignature.signature) : null;

  // Determine forwarder: for standard registration, it's the same as registeree
  // For self-relay, it's the relayer wallet
  const forwarder = isSelfRelay && relayer ? relayer : registeree;

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
      storedSignature.nonce === undefined
    ) {
      logger.contract.error('Cannot submit acknowledgement - missing required fields', {
        hasReportedChainId: storedSignature.reportedChainId !== undefined,
        hasIncidentTimestamp: storedSignature.incidentTimestamp !== undefined,
        hasNonce: storedSignature.nonce !== undefined,
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
        forwarder,
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
   */
  const handleRetry = () => {
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

  // Build signed message data for display
  const signedMessageData: SignedMessageData | null = storedSignature
    ? {
        registeree,
        forwarder: forwarder ?? expectedWallet,
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
