/**
 * Registration payment step.
 *
 * Submits the registration transaction using the stored signature.
 */

import { useEffect, useState } from 'react';
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import {
  TransactionCard,
  type TransactionStatus,
  type SignedMessageData,
  type CrossChainProgress,
} from '@/components/composed/TransactionCard';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useRegistrationStore } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useRegistration } from '@/hooks/useRegistration';
import { useQuoteRegistration } from '@/hooks/useQuoteRegistration';
import { useTransactionCost } from '@/hooks/useTransactionCost';
import {
  useCrossChainConfirmation,
  needsCrossChainConfirmation,
} from '@/hooks/useCrossChainConfirmation';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { getExplorerTxUrl, getChainName, getBridgeMessageByIdUrl } from '@/lib/explorer';
import { getHubChainId } from '@/lib/chains/config';
import { extractBridgeMessageId } from '@/lib/bridge/messageId';
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
  const { registrationType, bridgeMessageId, setRegistrationHash, setBridgeMessageId } =
    useRegistrationStore();
  const { registeree, relayer } = useFormStore();

  const isSelfRelay = registrationType === 'selfRelay';

  // Expected wallet for this step - relayer for self-relay, registeree for standard
  const expectedWallet = isSelfRelay ? relayer : registeree;

  // Check if correct wallet is connected
  const isCorrectWallet = Boolean(
    address && expectedWallet && areAddressesEqual(address, expectedWallet)
  );

  // Contract hooks
  const { submitRegistration, hash, isPending, isConfirming, isConfirmed, isError, error, reset } =
    useRegistration();
  const { feeWei, isLoading: isFeeLoading } = useQuoteRegistration(registeree);

  // Get transaction receipt for bridge message ID extraction
  const { data: receipt } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  });

  // Determine if submission should be disabled
  const isFeeReady = !isFeeLoading && feeWei !== undefined;

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Get stored signature
  const storedSignature = registeree
    ? getSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION)
    : null;

  // Build transaction args for gas estimation (needs to be before early returns)
  const transactionArgs =
    storedSignature && registeree
      ? ([
          storedSignature.deadline,
          storedSignature.nonce,
          registeree,
          parseSignature(storedSignature.signature).v,
          parseSignature(storedSignature.signature).r,
          parseSignature(storedSignature.signature).s,
        ] as const)
      : undefined;

  // Get transaction cost estimate (must be called unconditionally - hooks rule)
  const costEstimate = useTransactionCost({
    step: 'registration',
    args: transactionArgs,
  });

  // Check if this is a cross-chain registration (spoke → hub)
  const isCrossChain = needsCrossChainConfirmation(chainId);
  const hubChainId = getHubChainId(chainId);

  // Cross-chain confirmation - polls hub chain after spoke tx confirms
  const crossChainConfirmation = useCrossChainConfirmation({
    wallet: registeree ?? undefined,
    spokeChainId: chainId,
    enabled: isCrossChain && isConfirmed && !!registeree,
    pollInterval: 3000,
    maxPollingTime: 120000, // 2 minutes
  });

  // Extract bridge message ID from receipt logs (for cross-chain explorer links)
  useEffect(() => {
    if (!isCrossChain || !receipt?.logs) return;

    const messageId = extractBridgeMessageId(receipt.logs);
    if (messageId) {
      logger.registration.info('Stored bridge message ID for explorer link', { messageId });
      setBridgeMessageId(messageId);
    } else {
      logger.registration.debug('Could not extract bridge message ID from receipt', {
        logCount: receipt.logs.length,
      });
    }
  }, [isCrossChain, receipt, setBridgeMessageId]);

  // Map hook state to TransactionStatus
  const getStatus = (): TransactionStatus => {
    // Cross-chain states
    if (isCrossChain && isConfirmed) {
      if (crossChainConfirmation.status === 'confirmed') return 'hub-confirmed';
      if (
        crossChainConfirmation.status === 'polling' ||
        crossChainConfirmation.status === 'waiting'
      ) {
        return 'relaying';
      }
      // timeout or error - show as confirmed locally (user can check later)
      if (crossChainConfirmation.status === 'timeout') return 'confirmed';
    }
    // Local states
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending || isSubmitting) return 'submitting';
    if (isError || localError) return 'failed';
    return 'idle';
  };

  // Build cross-chain progress data for UI
  const crossChainProgress: CrossChainProgress | undefined =
    isCrossChain && getStatus() === 'relaying'
      ? {
          elapsedTime: crossChainConfirmation.elapsedTime,
          hubChainName: hubChainId ? getChainName(hubChainId) : undefined,
          bridgeName: costEstimate.data?.bridgeName ?? 'Hyperlane',
          messageId: bridgeMessageId ?? undefined,
          explorerUrl: bridgeMessageId ? getBridgeMessageByIdUrl(bridgeMessageId) : null,
        }
      : undefined;

  // Handle confirmed transaction
  useEffect(() => {
    // For cross-chain: wait for hub confirmation
    if (isCrossChain && isConfirmed && hash) {
      logger.contract.info('Registration transaction confirmed on spoke chain', {
        hash,
        registeree,
        registrationType,
        isCrossChain: true,
      });
      setRegistrationHash(hash, chainId);

      // Wait for hub confirmation before completing
      if (crossChainConfirmation.status === 'confirmed') {
        logger.registration.info('Cross-chain registration confirmed on hub!', {
          registeree,
          transactionHash: hash,
          elapsedTime: crossChainConfirmation.elapsedTime,
        });
        const timerId = window.setTimeout(onComplete, 1500);
        return () => clearTimeout(timerId);
      }

      // Handle timeout - still show as complete (user can verify later)
      if (crossChainConfirmation.status === 'timeout') {
        logger.registration.warn('Cross-chain confirmation timed out', {
          registeree,
          transactionHash: hash,
          elapsedTime: crossChainConfirmation.elapsedTime,
        });
        const timerId = window.setTimeout(onComplete, 1500);
        return () => clearTimeout(timerId);
      }

      return; // Still waiting for hub confirmation
    }

    // For local (hub chain): complete immediately
    if (!isCrossChain && isConfirmed && hash) {
      logger.contract.info('Registration transaction confirmed', {
        hash,
        registeree,
        registrationType,
      });
      setRegistrationHash(hash, chainId);
      logger.registration.info('Registration complete! Wallet successfully registered as stolen', {
        registeree,
        transactionHash: hash,
      });
      const timerId = window.setTimeout(onComplete, 1500);
      return () => clearTimeout(timerId);
    }
    // NOTE: crossChainConfirmation.elapsedTime intentionally excluded - it updates
    // every second and would cause this effect to re-run, canceling the setTimeout
    // before onComplete fires. Only status changes matter for completion logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isConfirmed,
    hash,
    setRegistrationHash,
    chainId,
    onComplete,
    registeree,
    registrationType,
    isCrossChain,
    crossChainConfirmation.status,
  ]);

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

    if (feeWei === undefined) {
      logger.contract.error('Cannot submit registration - fee quote unavailable', {
        registeree,
      });
      setLocalError('Unable to determine registration fee. Please try again.');
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
        feeWei,
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

      {/* Transaction card with integrated cost estimate */}
      <TransactionCard
        type="registration"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
        costEstimate={costEstimate}
        chainId={chainId}
        onSubmit={handleSubmit}
        onRetry={handleRetry}
        disabled={!isCorrectWallet || !isFeeReady}
        crossChainProgress={crossChainProgress}
      />

      {/* Disabled state messages */}
      {getStatus() === 'idle' && !isCorrectWallet && (
        <p className="text-sm text-muted-foreground text-center">
          Switch to the correct wallet above to submit the transaction.
        </p>
      )}
      {getStatus() === 'idle' && isCorrectWallet && !isFeeReady && (
        <p
          className="text-sm text-muted-foreground text-center"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {isFeeLoading ? 'Loading fee quote...' : 'Unable to fetch fee. Please try again.'}
        </p>
      )}
    </div>
  );
}
