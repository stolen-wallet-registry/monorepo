/**
 * Registration signing step.
 *
 * Signs the registration message after the grace period.
 */

import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useSignEIP712 } from '@/hooks/useSignEIP712';
import { useRegistrationHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { storeSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
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

  // Local state
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus>('idle');
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);

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
  } = useRegistrationHashStruct(forwarder ?? undefined);

  const { signRegistration, reset: resetSigning } = useSignEIP712();

  const isContractDataLoading = nonceLoading || hashLoading;
  const hasContractError = nonceError || hashError;

  /**
   * Handle signing the registration.
   */
  const handleSign = async () => {
    if (!registeree || !forwarder || !hashStructData || nonce === undefined) {
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    if (!isCorrectWallet) {
      setSignatureError('Please connect the correct wallet');
      setSignatureStatus('error');
      return;
    }

    // Refetch to get fresh deadline
    await refetchHashStruct();

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      const sig = await signRegistration({
        owner: registeree,
        forwarder,
        nonce,
        deadline: hashStructData.deadline,
      });

      // Store signature
      storeSignature({
        signature: sig,
        deadline: hashStructData.deadline,
        nonce,
        address: registeree,
        chainId,
        step: SIGNATURE_STEP.REGISTRATION,
        storedAt: Date.now(),
      });

      setSignature(sig);
      setSignatureStatus('success');

      // Advance to next step after short delay
      setTimeout(onComplete, 1000);
    } catch (err) {
      console.error('[RegistrationSignStep] Signing failed:', err);
      setSignatureError(err instanceof Error ? err.message : 'Failed to sign');
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
            forwarder,
            nonce,
            deadline: hashStructData.deadline,
          }}
          status={signatureStatus}
          error={signatureError}
          signature={signature}
          onSign={isCorrectWallet ? handleSign : () => {}}
          onRetry={handleRetry}
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
