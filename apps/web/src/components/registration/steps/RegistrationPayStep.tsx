/**
 * Registration payment step.
 *
 * Submits the registration transaction using the stored signature.
 */

import { useEffect, useState } from 'react';
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi';

import { Alert, AlertDescription, Button } from '@swr/ui';
import {
  TransactionCard,
  deriveTransactionStatus,
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
import {
  getSignature,
  removeSignature,
  parseSignature,
  isWindowBlockStale,
  describeWindowBlockStale,
  SIGNATURE_STEP,
} from '@/lib/signatures';
import { isSignatureInvalidatingError } from '@/lib/errors/signatureInvalidation';
import { useContractDeadlines } from '@/hooks/useContractDeadlines';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import type { WalletRegistrationArgs } from '@/lib/signatures';
import { areAddressesEqual } from '@/lib/address';
import { getExplorerTxUrl, getChainName, getBridgeMessageByIdUrl } from '@/lib/explorer';
import { getHubChainId } from '@/lib/chains/config';
import { extractBridgeMessageId } from '@/lib/bridge/messageId';
import { useInvalidateRegistryOnConfirm } from '@/hooks/useInvalidateRegistryOnConfirm';
import { SignatureInvalidatedAlert } from '@/components/registration/SignatureInvalidatedAlert';
import { FlowRecoveryAlert } from '@/components/registration/FlowRecoveryAlert';
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

  // Some reverts invalidate the signature itself (expired deadline, consumed nonce, expired
  // forwarder). Retrying those rebuilds the SAME transaction from the SAME cached signature
  // and reverts identically — the user could press Retry forever with no way to re-sign. Those
  // are routed to a re-sign instead of a resubmit.
  const { goToPreviousStep, goToStep, resetFlow } = useStepNavigation();
  const needsResign = isError && isSignatureInvalidatingError(error);

  // The contract reuses DeadlineExpired for two distinct failures: a stale signature
  // timestamp (fixable by re-signing) and a registration window that closed on-chain
  // (block.number past the acknowledgement's expiry — no new signature can fix it).
  // Without checking the on-chain deadlines, "Retry → re-sign" loops sign → revert → sign
  // forever once the window is closed. Zeroed deadlines mean no pending acknowledgement
  // (the contract reports isExpired for those too), so they don't count as closed.
  const { data: deadlines } = useContractDeadlines(registeree ?? undefined);
  const hasNoPendingAck =
    deadlines !== undefined && deadlines.start === 0n && deadlines.expiry === 0n;
  const windowClosed = deadlines !== undefined && !hasNoPendingAck && deadlines.isExpired;

  // Determine forwarder based on registration type:
  // - Standard: registeree pays and forwards (registeree == forwarder)
  // - Self-relay: relayer wallet is forwarder (undefined if relayer not set yet)
  // - P2P relay: handled by P2PRegPayStep (not this component)
  // - Future meta-tx: trusted 3rd party would be set as relayer
  const forwarder = isSelfRelay ? relayer : registeree;

  // Get stored signature, bound to the forwarder it was signed over. If the user went back
  // and edited the gas wallet after signing, the cached signature no longer matches the
  // struct the contract will verify, so it is treated as absent and the user is sent back to
  // sign rather than being shown an opaque on-chain revert.
  const storedSignature =
    registeree && forwarder
      ? getSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION, forwarder)
      : null;

  /**
   * The registration signature commits to `blockhash(windowBlock)`, and the EVM only keeps
   * 256 blocks of history — past that the contract reverts with
   * `TimingConfig__WindowBlockTooOld`. This is the same pre-flight the relayed path applies in
   * `reviewRelayedSignature`; it belongs here too, because a self-relay user who signs, then
   * switches wallets, then funds the gas wallet can easily spend more than 256 blocks (about
   * 8.5 minutes on Base) getting to this button. `currentBlock` comes off the `getDeadlines`
   * read already on screen, so it costs nothing extra.
   */
  const windowBlockStale = isWindowBlockStale(
    storedSignature?.windowBlock,
    deadlines?.currentBlock
  );

  /** Discard the dead signature and send the user back to sign a fresh one. */
  const handleResignAfterStale = () => {
    if (registeree) {
      removeSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION);
    }
    logger.registration.warn('Registration window block aged out of blockhash range; re-signing', {
      registeree,
      windowBlock: storedSignature?.windowBlock?.toString(),
      currentBlock: deadlines?.currentBlock?.toString(),
    });
    goToPreviousStep();
  };

  // Parse signature once for reuse (avoid calling parseSignature 4 times)
  const parsedSig = storedSignature ? parseSignature(storedSignature.signature) : null;

  // Build transaction args for gas estimation (needs to be before early returns)
  // Unified: register(wallet, forwarder, reportedChainId, incidentTimestamp, deadline, nonce,
  //                   windowBlock, v, r, s)
  const transactionArgs: WalletRegistrationArgs | undefined =
    storedSignature &&
    registeree &&
    forwarder &&
    parsedSig &&
    storedSignature.reportedChainId !== undefined &&
    storedSignature.incidentTimestamp !== undefined &&
    storedSignature.nonce !== undefined &&
    storedSignature.windowBlock !== undefined
      ? ([
          registeree,
          forwarder,
          storedSignature.reportedChainId,
          storedSignature.incidentTimestamp,
          storedSignature.deadline,
          storedSignature.nonce,
          storedSignature.windowBlock,
          parsedSig.v,
          parsedSig.r,
          parsedSig.s,
        ] as const satisfies WalletRegistrationArgs)
      : undefined;

  // Get transaction cost estimate (must be called unconditionally - hooks rule)
  const costEstimate = useTransactionCost({
    step: 'registration',
    args: transactionArgs,
    ownerAddress: registeree,
  });

  // Check if this is a cross-chain registration (spoke → hub)
  const isCrossChain = needsCrossChainConfirmation(chainId);
  const hubChainId = getHubChainId(chainId);

  // Cross-chain confirmation - polls hub chain after spoke tx confirms
  const crossChainConfirmation = useCrossChainConfirmation({
    registry: 'wallet',
    wallet: registeree ?? undefined,
    spokeChainId: chainId,
    enabled: isCrossChain && isConfirmed && !!registeree,
    pollInterval: 3000,
    maxPollingTime: 120000, // 2 minutes
  });

  // Extract bridge message ID from receipt logs (for cross-chain explorer links)
  useEffect(() => {
    if (!isCrossChain || !receipt?.logs) return;

    const extractMessage = async () => {
      const messageId = await extractBridgeMessageId(receipt.logs);
      if (messageId) {
        logger.registration.info('Stored bridge message ID for explorer link', { messageId });
        setBridgeMessageId(messageId);
      } else {
        logger.registration.debug('Could not extract bridge message ID from receipt', {
          logCount: receipt.logs.length,
        });
      }
    };
    void extractMessage();
  }, [isCrossChain, receipt, setBridgeMessageId]);

  useInvalidateRegistryOnConfirm('registration', hash, isConfirmed);

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
    return deriveTransactionStatus({
      isConfirmed,
      isConfirming,
      isPending,
      isError,
      isSubmitting,
      localError,
    });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elapsedTime excluded: updates every second and would cancel the setTimeout before onComplete fires
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

    if (!storedSignature || !registeree || !forwarder || !parsedSig) {
      logger.contract.error('Cannot submit registration - missing data', {
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
      // Signed over blockhash(windowBlock); without the number the contract cannot recompute it.
      storedSignature.windowBlock === undefined
    ) {
      logger.contract.error('Cannot submit registration - missing required fields', {
        hasReportedChainId: storedSignature.reportedChainId !== undefined,
        hasIncidentTimestamp: storedSignature.incidentTimestamp !== undefined,
        hasNonce: storedSignature.nonce !== undefined,
        hasWindowBlock: storedSignature.windowBlock !== undefined,
      });
      setLocalError('Signature is missing required data. Please go back and sign again.');
      return;
    }

    if (windowBlockStale) {
      logger.contract.error('Cannot submit registration - committed window block is too old', {
        registeree,
        windowBlock: storedSignature.windowBlock?.toString(),
        currentBlock: deadlines?.currentBlock?.toString(),
      });
      setLocalError(describeWindowBlockStale());
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
      // parsedSig already computed at component level (reused here)
      logger.contract.info('Submitting walletRegistration to contract', {
        deadline: storedSignature.deadline.toString(),
        nonce: storedSignature.nonce.toString(),
        registeree,
        signatureV: parsedSig.v,
        chainId,
      });

      // reportedChainId is raw uint64 chain ID — contract converts to CAIP-2 hash internally
      const reportedChainId = storedSignature.reportedChainId;
      const incidentTimestamp = storedSignature.incidentTimestamp;

      await submitRegistration({
        registeree,
        trustedForwarder: forwarder,
        reportedChainId,
        incidentTimestamp,
        deadline: storedSignature.deadline,
        nonce: storedSignature.nonce,
        windowBlock: storedSignature.windowBlock,
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
   *
   * Plain retry for anything a resubmit can fix (gas, RPC, nonce-of-the-EOA). For a
   * signature-invalidating revert, the stored signature is discarded and the user is sent
   * back to the sign step — otherwise the same bytes get resubmitted forever.
   */
  const handleRetry = () => {
    if (needsResign) {
      if (registeree) {
        removeSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION);
      }
      reset();
      setLocalError(null);

      // Window closed on-chain: a fresh registration signature reverts identically, so the
      // flow must restart from acknowledgement. The old ACK signature's nonce is consumed,
      // so it is discarded too.
      if (windowClosed) {
        logger.registration.warn(
          'Registration window closed on-chain, restarting from acknowledgement',
          { registeree, error: error?.message }
        );
        if (registeree) {
          removeSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT);
        }
        goToStep('acknowledge-and-sign');
        return;
      }

      logger.registration.warn('Registration signature invalidated by revert, returning to sign', {
        registeree,
        error: error?.message,
      });
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
      <FlowRecoveryAlert actionLabel="Start Over" onAction={resetFlow}>
        Missing registration data. Start over to begin a new registration.
      </FlowRecoveryAlert>
    );
  }

  // Missing signature
  if (!storedSignature) {
    return (
      <FlowRecoveryAlert actionLabel="Back to Signing" onAction={goToPreviousStep}>
        Signature not found. Go back and sign the registration again.
      </FlowRecoveryAlert>
    );
  }

  // Get explorer URL
  const explorerUrl = hash ? getExplorerTxUrl(chainId, hash) : null;

  // Get error message - sanitize both local errors and hook errors
  const errorMessage = localError || (error ? sanitizeErrorMessage(error) : null);

  // Build signed message data for display
  const signedMessageData: SignedMessageData | null =
    storedSignature && forwarder
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
      {/* Wallet switch prompt (self-relay needs to switch to relayer) */}
      {isSelfRelay && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={expectedWallet}
          expectedLabel="Gas Wallet"
          currentLabel="Stolen Wallet"
        />
      )}

      {needsResign && <SignatureInvalidatedAlert windowClosed={windowClosed} />}

      {windowBlockStale && !needsResign && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{describeWindowBlockStale()}</span>
            <Button variant="outline" size="sm" onClick={handleResignAfterStale}>
              Sign Again
            </Button>
          </AlertDescription>
        </Alert>
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
        disabled={!isCorrectWallet || !isFeeReady || windowBlockStale}
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
