/**
 * Registration signing step.
 *
 * Signs the registration message after the grace period.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useSignEIP712 } from '@/hooks/useSignEIP712';
import { useGenerateHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { storeSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import type { Hex } from '@/lib/types/ethereum';
import { AlertCircle, Loader2 } from 'lucide-react';

export interface RegistrationSignStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Registration signing step - signs the REG message.
 */
export function RegistrationSignStep({ onComplete }: RegistrationSignStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registrationType } = useRegistrationStore();
  const { registeree, relayer } = useFormStore();

  const isSelfRelay = registrationType === 'selfRelay';

  // Expected wallet for this step - always the registeree (stolen wallet) for signing
  const expectedWallet = registeree;

  // Check if correct wallet is connected
  const isCorrectWallet = address && expectedWallet && areAddressesEqual(address, expectedWallet);

  // Forwarder is either relayer (self-relay) or registeree (standard)
  const forwarder = isSelfRelay ? relayer : registeree;

  // Stabilize fields for this signing session - computed once per mount
  // This ensures the same values are used for both signing and storage
  const stableFields = useMemo(
    () => ({
      reportedChainId: BigInt(chainId),
      incidentTimestamp: 0n, // TODO: Add incident timestamp selection UI
    }),
    [chainId]
  );

  // Local state
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus>('idle');
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);
  const [shouldAdvance, setShouldAdvance] = useState(false);

  // Ref to track onComplete for cleanup
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Contract hooks
  const {
    nonce,
    isLoading: nonceLoading,
    isError: nonceError,
  } = useContractNonce(registeree ?? undefined);
  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useGenerateHashStruct(forwarder ?? undefined, SIGNATURE_STEP.REGISTRATION);

  const { signRegistration, reset: resetSigning } = useSignEIP712();

  const isContractDataLoading = nonceLoading || hashLoading;
  const hasContractError = nonceError || hashError;

  // Handle advancing to next step with cleanup
  useEffect(() => {
    if (shouldAdvance) {
      const timerId = window.setTimeout(() => {
        onCompleteRef.current();
      }, 1000);
      return () => clearTimeout(timerId);
    }
  }, [shouldAdvance]);

  /**
   * Handle signing the registration.
   */
  const handleSign = async () => {
    logger.signature.info('Registration sign requested', {
      registeree,
      forwarder,
      hasHashStructData: !!hashStructData,
      hasNonce: nonce !== undefined,
      isCorrectWallet,
      connectedAddress: address,
      registrationType,
    });

    if (!registeree || !forwarder || nonce === undefined) {
      logger.signature.error('Missing required data for registration signing', {
        registeree,
        forwarder,
        hashStructData: !!hashStructData,
        nonce,
      });
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    if (!isCorrectWallet) {
      logger.wallet.warn('Wrong wallet connected for registration signing', {
        connected: address,
        expected: expectedWallet,
      });
      setSignatureError('Please connect the correct wallet');
      setSignatureStatus('error');
      return;
    }

    // Refetch to get fresh deadline
    logger.contract.debug('Refetching hash struct for fresh registration deadline');
    const refetchResult = await refetchHashStruct();
    // Refetch returns raw contract data [deadline, hashStruct], transform if present
    const rawData = refetchResult?.data as [bigint, Hex] | undefined;
    const freshDeadline = rawData?.[0] ?? hashStructData?.deadline;

    if (freshDeadline === undefined) {
      logger.signature.error('Failed to get hash struct data');
      setSignatureError('Failed to load signing data. Please try again.');
      setSignatureStatus('error');
      return;
    }

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      // Use stabilized fields - computed once per mount, not fresh on each sign
      const { reportedChainId, incidentTimestamp } = stableFields;

      logger.signature.info('Requesting EIP-712 registration signature', {
        wallet: registeree,
        forwarder,
        reportedChainId: reportedChainId.toString(),
        incidentTimestamp: incidentTimestamp.toString(),
        nonce: nonce.toString(),
        deadline: freshDeadline.toString(),
        chainId,
      });

      const sig = await signRegistration({
        wallet: registeree,
        trustedForwarder: forwarder,
        reportedChainId,
        incidentTimestamp,
        nonce,
        deadline: freshDeadline,
      });

      logger.signature.info('Registration signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
      });

      // Store signature with stabilized fields (same values used for signing)
      storeSignature({
        signature: sig,
        deadline: freshDeadline,
        nonce,
        address: registeree,
        chainId,
        step: SIGNATURE_STEP.REGISTRATION,
        storedAt: Date.now(),
        reportedChainId,
        incidentTimestamp,
      });
      logger.signature.debug('Registration signature stored in sessionStorage');

      setSignature(sig);
      setSignatureStatus('success');

      logger.registration.info('Registration signing complete, advancing to payment step');
      // Trigger advance to next step (handled by useEffect with cleanup)
      setShouldAdvance(true);
    } catch (err) {
      logger.signature.error(
        'Registration signing failed',
        {
          error: err instanceof Error ? err.message : String(err),
        },
        err instanceof Error ? err : undefined
      );
      setSignatureError(sanitizeErrorMessage(err));
      setSignatureStatus('error');
    }
  };

  /**
   * Handle retry after signing error.
   */
  const handleRetry = () => {
    resetSigning();
    setSignatureStatus('idle');
    setSignatureError(null);
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
  if (!registeree || !forwarder) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Missing registration data. Please start over from the beginning.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Wallet switch prompt (self-relay needs to switch back to registeree) */}
      {isSelfRelay && expectedWallet && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={expectedWallet}
          expectedLabel="Stolen Wallet"
          currentLabel="Gas Wallet"
        />
      )}

      {/* Loading state for contract data */}
      {isContractDataLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading contract data...
        </div>
      )}

      {/* Error state for contract data */}
      {hasContractError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load contract data. Please try again.</AlertDescription>
        </Alert>
      )}

      {/* Signature card */}
      {!isContractDataLoading && !hasContractError && hashStructData && nonce !== undefined && (
        <SignatureCard
          type="registration"
          data={{
            registeree,
            trustedForwarder: forwarder,
            nonce,
            deadline: hashStructData.deadline,
            chainId,
          }}
          status={signatureStatus}
          error={signatureError}
          signature={signature}
          onSign={handleSign}
          onRetry={handleRetry}
          disabled={!isCorrectWallet}
        />
      )}

      {/* Disabled state message when wrong wallet */}
      {!isCorrectWallet && signatureStatus === 'idle' && !isContractDataLoading && (
        <p className="text-sm text-muted-foreground text-center">
          Switch to the correct wallet above to sign the registration.
        </p>
      )}
    </div>
  );
}
