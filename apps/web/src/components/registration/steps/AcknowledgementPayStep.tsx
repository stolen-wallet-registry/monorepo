/**
 * Acknowledgement payment step.
 *
 * Submits the acknowledgement transaction using the stored signature.
 */

import { useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { TransactionCard, type TransactionStatus } from '@/components/composed/TransactionCard';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useAcknowledgement } from '@/hooks/useAcknowledgement';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { getExplorerTxUrl } from '@/lib/explorer';
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
  const isCorrectWallet = address && expectedWallet && areAddressesEqual(address, expectedWallet);

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
      setAcknowledgementHash(hash);
      // Advance to next step after short delay
      setTimeout(onComplete, 1500);
    }
  }, [isConfirmed, hash, setAcknowledgementHash, onComplete]);

  /**
   * Submit the acknowledgement transaction.
   */
  const handleSubmit = async () => {
    if (!storedSignature || !registeree) {
      setLocalError('Missing signature data. Please go back and sign again.');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const parsedSig = parseSignature(storedSignature.signature);

      await submitAcknowledgement({
        deadline: storedSignature.deadline,
        nonce: storedSignature.nonce,
        registeree,
        signature: parsedSig,
      });
    } catch (err) {
      console.error('[AcknowledgementPayStep] Submit failed:', err);
      setLocalError(err instanceof Error ? err.message : 'Transaction failed');
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

  // Get error message
  const errorMessage =
    localError || (error instanceof Error ? error.message : error ? String(error) : null);

  return (
    <div className="space-y-4">
      {/* Wallet switch prompt (self-relay only) */}
      {isSelfRelay && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={expectedWallet}
          expectedLabel="Gas Wallet"
        />
      )}

      {/* Transaction card */}
      <TransactionCard
        type="acknowledgement"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        onSubmit={isCorrectWallet ? handleSubmit : () => {}}
        onRetry={handleRetry}
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
