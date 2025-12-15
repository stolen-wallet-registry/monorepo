/**
 * Registration payment step.
 *
 * Submits the registration transaction using the stored signature.
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
import { useRegistration } from '@/hooks/useRegistration';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { getExplorerTxUrl } from '@/lib/explorer';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface RegistrationPayStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Registration payment step - submits the REG transaction.
 */
export function RegistrationPayStep({ onComplete }: RegistrationPayStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registrationType, setRegistrationHash } = useRegistrationStore();
  const { registeree, relayer } = useFormStore();

  const isSelfRelay = registrationType === 'selfRelay';

  // Expected wallet for this step - relayer for self-relay, registeree for standard
  const expectedWallet = isSelfRelay ? relayer : registeree;

  // Check if correct wallet is connected
  const isCorrectWallet = Boolean(
    address && expectedWallet && areAddressesEqual(address, expectedWallet)
  );

  // Contract hook
  const { submitRegistration, hash, isPending, isConfirming, isConfirmed, isError, error, reset } =
    useRegistration();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Get stored signature
  const storedSignature = registeree
    ? getSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION)
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
      logger.contract.info('Registration transaction confirmed', {
        hash,
        registeree,
        registrationType,
      });
      setRegistrationHash(hash);
      logger.registration.info('Registration complete! Wallet successfully registered as stolen', {
        registeree,
        transactionHash: hash,
      });
      // Advance to next step after short delay
      const timerId = window.setTimeout(onComplete, 1500);
      return () => clearTimeout(timerId);
    }
  }, [isConfirmed, hash, setRegistrationHash, onComplete, registeree, registrationType]);

  /**
   * Submit the registration transaction.
   */
  const handleSubmit = async () => {
    logger.contract.info('Registration transaction submission initiated', {
      registeree,
      hasStoredSignature: !!storedSignature,
      registrationType,
      connectedWallet: address,
      expectedWallet,
      isCorrectWallet,
    });

    if (!storedSignature || !registeree) {
      logger.contract.error('Cannot submit registration - missing data', {
        hasStoredSignature: !!storedSignature,
        registeree,
      });
      setLocalError('Missing signature data. Please go back and sign again.');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const parsedSig = parseSignature(storedSignature.signature);

      logger.contract.info('Submitting walletRegistration to contract', {
        deadline: storedSignature.deadline.toString(),
        nonce: storedSignature.nonce.toString(),
        registeree,
        signatureV: parsedSig.v,
        chainId,
      });

      await submitRegistration({
        deadline: storedSignature.deadline,
        nonce: storedSignature.nonce,
        registeree,
        signature: parsedSig,
      });

      logger.contract.info('Registration transaction submitted, waiting for confirmation');
    } catch (err) {
      logger.contract.error(
        'Registration transaction failed',
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
          Signature not found. Please go back and sign the registration again.
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
        forwarder: expectedWallet,
        nonce: storedSignature.nonce,
        deadline: storedSignature.deadline,
        signature: storedSignature.signature,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Wallet switch prompt (self-relay needs to switch to relayer) */}
      {isSelfRelay && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={expectedWallet}
          expectedLabel="Gas Wallet"
          currentLabel="Stolen Wallet"
        />
      )}

      {/* Transaction card */}
      <TransactionCard
        type="registration"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
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
