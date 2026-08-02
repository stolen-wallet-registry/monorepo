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
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { storeSignature, removeSignature, SIGNATURE_STEP } from '@/lib/signatures';
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
    refetch: refetchNonce,
  } = useContractNonce(registeree ?? undefined);
  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useGenerateHashStruct(forwarder ?? undefined, SIGNATURE_STEP.REGISTRATION);

  const { signRegistration, reset: resetSigning } = useSignEIP712();

  // The registration signature commits to the hash of a block at or after the acknowledgement's
  // grace-period start. Passing the start block lets the signer refuse early rather than
  // producing a signature the contract will reject.
  const { data: deadlines } = useContractDeadlines(registeree ?? undefined);

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

    // Refetch nonce and deadline together - do not use stale data.
    // CRITICAL: acknowledge() increments nonces[registeree], so the nonce cached by
    // useContractNonce (staleTime 30s) is one behind by the time we reach this step.
    // Signing with it produces a signature that reverts with WalletRegistry__InvalidNonce.
    logger.contract.debug('Refetching nonce and hash struct for fresh registration data');
    const [nonceResult, refetchResult] = await Promise.all([refetchNonce(), refetchHashStruct()]);

    const freshNonce = nonceResult.status === 'success' ? (nonceResult.data as bigint) : undefined;

    if (freshNonce === undefined) {
      logger.signature.error('Failed to get fresh nonce', {
        nonceStatus: nonceResult.status,
        nonceError: nonceResult.error?.message,
      });
      setSignatureError('Failed to load fresh nonce. Please try again.');
      setSignatureStatus('error');
      return;
    }

    // Refetch returns the raw contract value: a bare uint256 deadline. (It used to be a
    // [deadline, hashStruct] tuple; the hash struct was removed because the registration
    // typehash commits to a windowBlockHash this call cannot know.) Reading it as a tuple
    // would silently yield undefined and fall back to the cached, staler deadline.
    const freshDeadline =
      typeof refetchResult?.data === 'bigint' ? refetchResult.data : hashStructData?.deadline;

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
        nonce: freshNonce.toString(),
        deadline: freshDeadline.toString(),
        chainId,
      });

      const {
        signature: sig,
        windowBlock,
        windowBlockHash,
      } = await signRegistration({
        wallet: registeree,
        trustedForwarder: forwarder,
        reportedChainId,
        incidentTimestamp,
        nonce: freshNonce,
        deadline: freshDeadline,
        gracePeriodStart: deadlines?.start,
      });

      logger.signature.info('Registration signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
        windowBlock: windowBlock.toString(),
      });

      // Store signature with stabilized fields (same values used for signing)
      storeSignature({
        signature: sig,
        deadline: freshDeadline,
        nonce: freshNonce,
        address: registeree,
        chainId,
        step: SIGNATURE_STEP.REGISTRATION,
        storedAt: Date.now(),
        // Bind the cached signature to the forwarder it was signed over, so editing the gas
        // wallet afterwards invalidates it here instead of on-chain.
        trustedForwarder: forwarder,
        reportedChainId,
        incidentTimestamp,
        // The pay step must submit the block that was signed over, not re-derive one.
        windowBlock,
        // Stored alongside it for the same reason `TxRegisterSignStep` does: this is the value
        // actually inside the signed struct, and anything re-deriving the digest later cannot
        // read it back off-chain once the chain has moved past the 256-block `blockhash` window.
        windowBlockHash,
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
    // Discard any stored signature before retrying. A signature that failed (typically a
    // stale nonce) is permanently unusable, and leaving it in sessionStorage means the
    // payment step can pick the bad one up again instead of the freshly signed replacement.
    if (registeree) {
      removeSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION);
    }
    resetSigning();
    setSignature(null);
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
