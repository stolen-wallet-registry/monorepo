/**
 * Transaction batch acknowledgement payment step.
 *
 * Submits the acknowledgement transaction using the stored signature.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { Alert, AlertDescription, Button, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import {
  TransactionCard,
  deriveTransactionStatus,
  type TransactionStatus,
  type SignedMessageData,
} from '@/components/composed/TransactionCard';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { RelayedSignatureReview } from '@/components/composed/RelayedSignatureReview';
import { useRelayedTxSignatureReview } from '@/hooks/p2p/useRelayedSignatureReview';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { areAddressesEqual } from '@/lib/address';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import {
  useTransactionAcknowledgement,
  useTxGasEstimate,
  type TxAcknowledgementParams,
  type TxAcknowledgementParamsHub,
  type TxAcknowledgementParamsSpoke,
} from '@/hooks/transactions';
import { isHubChain, isSpokeChain } from '@swr/chains';
import type { TransactionCost } from '@/hooks/useTransactionCost';
import { useEthPrice } from '@/hooks/useEthPrice';
import {
  getTxSignature,
  removeTxSignature,
  TX_SIGNATURE_STEP,
  computeTransactionDataHash,
} from '@/lib/signatures/transactions';
import { getTxPreviousStep } from '@/stores/transactionRegistrationStore';
import type { Hash } from '@/lib/types/ethereum';
import { parseSignature } from '@/lib/signatures';
import { chainIdToBytes32, toCAIP2, getChainName } from '@swr/chains';
import { DATA_HASH_TOOLTIP } from '@/lib/utils';
import { getExplorerTxUrl } from '@/lib/explorer';
import { useInvalidateRegistryOnConfirm } from '@/hooks/useInvalidateRegistryOnConfirm';
import { SignatureInvalidatedAlert } from '@/components/registration/SignatureInvalidatedAlert';
import { FlowRecoveryAlert } from '@/components/registration/FlowRecoveryAlert';
import { classifyP2PRetry, sendResignRequest } from '@/components/registration/p2pResignRequest';
import { useP2PStore } from '@/stores/p2pStore';
import { armResignAck, waitForResignAck, type ResignAckOutcome } from '@/lib/p2p';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface TxAcknowledgePayStepProps {
  /** Called when step is complete */
  onComplete: () => void;
  /**
   * P2P relay only: getter for the relayer's libp2p node, used to ask the reporter to sign
   * again when a revert kills the relayed signature. Optional because the standard and
   * self-relay flows render this step with no peer at all. Without it the P2P path still
   * discards the dead signature — it just cannot deliver the request, and says so.
   *
   * A getter, not the node: libp2p is a Proxy that throws when React DevTools serialises it.
   */
  getLibp2p?: () => Libp2p | null;
}

/**
 * Transaction batch acknowledgement payment step - submits the ACK transaction.
 */
export function TxAcknowledgePayStep({ onComplete, getLibp2p }: TxAcknowledgePayStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep, setAcknowledgementHash } =
    useTransactionRegistrationStore();
  const {
    selectedTxHashes,
    selectedTxDetails,
    reportedChainId,
    txHashesForContract,
    chainIdsForContract,
  } = useTransactionSelection();

  const isRelayed = registrationType === 'selfRelay' || registrationType === 'p2pRelay';

  // Compute dataHash from sorted arrays for signing/contract calls
  const dataHash: Hash | undefined =
    txHashesForContract.length > 0 &&
    chainIdsForContract.length > 0 &&
    txHashesForContract.length === chainIdsForContract.length
      ? computeTransactionDataHash(txHashesForContract, chainIdsForContract)
      : undefined;

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
  } = useTransactionAcknowledgement();

  // Get ETH price for cost display
  const { data: ethPrice } = useEthPrice();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * P2P only. Set once Retry has discarded a dead relayed signature; `notified` records
   * whether the reporter actually received the request to sign again.
   */
  const [resignRequest, setResignRequest] = useState<{
    notified: boolean | null;
    /** The reporter's answer, or null while the request is still in flight. */
    ack: ResignAckOutcome | null;
  } | null>(null);
  const partnerPeerId = useP2PStore((s) => s.partnerPeerId);
  const pairedWallet = useP2PStore((s) => s.pairedWallet);

  // See handleRetry: some reverts make the stored signature permanently unusable, so Retry
  // has to mean "sign again", not "submit the same bytes again".
  //
  // No `windowClosed` argument, matching `P2PAckPayStep`: this is an acknowledgement step, so
  // there is no prior on-chain window to have closed and the classifier can only ever return
  // `signature-invalidated` here. Routing through it anyway keeps the "which reverts kill a
  // signature" decision in one place for all four relayed pay steps.
  const retryAction = classifyP2PRetry({ isError, error });
  const needsResign = retryAction.kind === 'request-resign';

  /**
   * The forwarder as it stands NOW, not as it stood when the signature was made.
   *
   * The gas wallet is part of the EIP-712 struct but not part of the signature's storage key,
   * so a reporter who goes back and changes it gets the OLD signature handed back — and the
   * pay step then insists they connect the wallet they just replaced, with no re-sign path
   * out. Passing this to `getTxSignature` makes that a "please sign again" instead. See the
   * `expectedForwarder` note there; the wallet flow has carried this since its own version of
   * the bug.
   */
  const liveForwarder = useTransactionFormStore((s) => s.forwarder) ?? undefined;

  /**
   * Who the signature must belong to. Part of the storage key: `dataHash` commits to the batch
   * and nothing else, so without this a browser that handled two reporters with the same batch
   * on the same chain hands back the first one's signature.
   */
  const formReporter = useTransactionFormStore((s) => s.reporter) ?? undefined;

  // SSR-safe signature retrieval - sessionStorage not available during SSR
  // Use undefined for "not yet loaded" vs null for "loaded but not found"
  const [storedSignature, setStoredSignature] = useState<
    ReturnType<typeof getTxSignature> | undefined
  >(undefined);

  useEffect(() => {
    if (dataHash && formReporter) {
      setStoredSignature(
        getTxSignature(
          formReporter,
          dataHash,
          chainId,
          TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
          liveForwarder
        )
      );
    } else {
      setStoredSignature(null);
    }
  }, [dataHash, chainId, liveForwarder, formReporter]);

  // Signature is still loading from sessionStorage
  const isSignatureLoading = storedSignature === undefined;

  // Expected wallet for this step: forwarder (gas wallet) for self-relay/p2p-relay, reporter for standard
  const expectedWallet = storedSignature
    ? isRelayed
      ? storedSignature.trustedForwarder
      : storedSignature.reporter
    : undefined;

  // Check if correct wallet is connected
  const isCorrectWallet = Boolean(
    address && expectedWallet && areAddressesEqual(address, expectedWallet)
  );

  // P2P relay only: the signature arrived from a peer over the network, so before the
  // relayer pays for it, recover the signer from the EIP-712 digest, re-read the nonce from
  // the contract, and check the deadline. Self-relay and standard skip this — the connected
  // wallet signed it itself, there is no peer to distrust.
  const isP2PRelayed = registrationType === 'p2pRelay';
  const { review: signatureReview, isChecking: isReviewingSignature } = useRelayedTxSignatureReview(
    {
      enabled: isP2PRelayed && !!storedSignature,
      step: TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
      storedSignature,
      expectedSigner: storedSignature?.reporter, // logged only; gating uses pairedWallet
      trustedForwarder: storedSignature?.trustedForwarder,
    }
  );
  // Only blocks the P2P path; elsewhere there is nothing to verify against.
  const isSignatureReviewBlocking = isP2PRelayed && !signatureReview?.ok;

  // Convert reported chain ID to CAIP-2 format - cache both for display and contract use
  // Guard against invalid chain IDs (must be positive safe integer)
  const reportedChainIdCaip2 =
    reportedChainId != null && Number.isSafeInteger(reportedChainId) && reportedChainId > 0
      ? toCAIP2(reportedChainId)
      : undefined;
  const reportedChainIdHash =
    reportedChainId != null && Number.isSafeInteger(reportedChainId) && reportedChainId > 0
      ? chainIdToBytes32(reportedChainId)
      : undefined;

  // Use sorted hashes and chain IDs for contract calls
  // These must match the order used to compute the data hash
  // Guard against undefined during store hydration
  const txHashesForContractGuarded =
    txHashesForContract && txHashesForContract.length > 0 ? txHashesForContract : undefined;
  const chainIdsForContractGuarded =
    chainIdsForContract && chainIdsForContract.length > 0 ? chainIdsForContract : undefined;

  // Parse signature for gas estimation
  const parsedSigForEstimate = storedSignature
    ? parseSignature(storedSignature.signature)
    : undefined;

  // Determine if hub or spoke for proper params
  const isHub = isHubChain(chainId);
  const isSpoke = isSpokeChain(chainId);

  // Get gas estimate (acknowledgement step - no fees, just gas)
  const {
    data: gasEstimate,
    isLoading: gasLoading,
    isError: gasError,
    refetch: refetchGas,
  } = useTxGasEstimate({
    step: 'acknowledgement',
    dataHash: dataHash,
    reportedChainId: reportedChainIdHash,
    transactionCount: selectedTxHashes.length,
    reporter: storedSignature?.reporter,
    // Hub-specific params
    trustedForwarder: isHub ? storedSignature?.trustedForwarder : undefined,
    // Spoke-specific params
    nonce: isSpoke ? storedSignature?.nonce : undefined,
    deadline: storedSignature?.deadline,
    signature: parsedSigForEstimate,
    enabled: !!storedSignature && !!dataHash && !!reportedChainIdHash && isCorrectWallet && !hash, // Stop polling once tx is submitted
  });

  useInvalidateRegistryOnConfirm('transaction-acknowledgement', hash, isConfirmed);

  // Map hook state to TransactionStatus
  const getStatus = (): TransactionStatus =>
    deriveTransactionStatus({
      isConfirmed,
      isConfirming,
      isPending,
      isError,
      isSubmitting,
      localError,
    });

  // Handle confirmed transaction
  useEffect(() => {
    if (isConfirmed && hash) {
      logger.contract.info('Transaction batch acknowledgement transaction confirmed', {
        hash,
        dataHash,
        transactionCount: selectedTxHashes.length,
      });
      setAcknowledgementHash(hash, chainId);
      logger.registration.info(
        'Transaction batch acknowledgement complete, advancing to grace period'
      );
      // Advance to next step after delay to let user see success
      const timerId = setTimeout(onComplete, 3000);
      return () => clearTimeout(timerId);
    }
  }, [isConfirmed, hash, setAcknowledgementHash, chainId, onComplete, dataHash, selectedTxHashes]);

  /**
   * Submit the acknowledgement transaction.
   */
  const handleSubmit = useCallback(async () => {
    // Re-entrancy guard
    if (isSubmitting) {
      logger.contract.warn(
        'Acknowledgement submission already in progress, ignoring duplicate call'
      );
      return;
    }

    logger.contract.info('Transaction batch acknowledgement submission initiated', {
      dataHash,
      transactionCount: selectedTxHashes.length,
      hasStoredSignature: !!storedSignature,
      registrationType,
      connectedWallet: address,
      expectedWallet,
      isCorrectWallet,
    });

    if (isSignatureReviewBlocking) {
      logger.contract.warn('Blocked ACK submission: relayed signature did not pass verification', {
        issues: signatureReview?.issues,
      });
      setLocalError(
        'The signature you received could not be verified. See the details above before paying.'
      );
      return;
    }

    if (!storedSignature || !dataHash || !reportedChainIdHash) {
      logger.contract.error('Cannot submit transaction acknowledgement - missing data', {
        hasStoredSignature: !!storedSignature,
        dataHash,
        reportedChainIdHash,
      });
      setLocalError('Missing signature data. Please go back and sign again.');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    // Validate that selection hasn't changed since signing
    if (storedSignature.transactionCount !== selectedTxHashes.length) {
      logger.contract.warn('Transaction count mismatch - selection changed after signing', {
        signedCount: storedSignature.transactionCount,
        currentCount: selectedTxHashes.length,
      });
      setIsSubmitting(false);
      setLocalError('Selection changed after signing. Please go back and re-sign.');
      return;
    }

    try {
      const parsedSig = parseSignature(storedSignature.signature);

      // Validate transaction data is available
      if (!txHashesForContractGuarded || !chainIdsForContractGuarded) {
        logger.contract.error('Missing transaction data for acknowledgement', {
          hasTxHashes: !!txHashesForContractGuarded,
          hasChainIds: !!chainIdsForContractGuarded,
        });
        setLocalError('Transaction data not ready. Please go back and try again.');
        return;
      }

      logger.contract.info('Submitting transaction batch acknowledge to contract', {
        dataHash,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        deadline: storedSignature.deadline.toString(),
        chainId,
        txHashesCount: txHashesForContractGuarded?.length,
        firstTxHash: txHashesForContractGuarded?.[0],
        lastTxHash: txHashesForContractGuarded?.[txHashesForContractGuarded?.length - 1],
        firstChainId: chainIdsForContractGuarded?.[0],
      });

      // Build params based on chain type (hub vs spoke have different signatures)
      let params: TxAcknowledgementParams;

      if (isHub) {
        // Hub: acknowledgeTransactions(reporter, trustedForwarder, deadline, dataHash, reportedChainId, transactionCount, v, r, s)
        // isSponsored is derived on-chain as (reporter != trustedForwarder)
        const hubParams: TxAcknowledgementParamsHub = {
          reporter: storedSignature.reporter,
          trustedForwarder: storedSignature.trustedForwarder,
          deadline: storedSignature.deadline,
          dataHash: dataHash!,
          reportedChainId: reportedChainIdHash!,
          transactionCount: selectedTxHashes.length,
          signature: parsedSig,
        };
        params = hubParams;
      } else {
        // Spoke: acknowledgeTransactionBatch(dataHash, reportedChainId, transactionCount, deadline, nonce, reporter, v, r, s)
        const spokeParams: TxAcknowledgementParamsSpoke = {
          reporter: storedSignature.reporter,
          dataHash: dataHash!,
          reportedChainId: reportedChainIdHash,
          transactionCount: selectedTxHashes.length,
          deadline: storedSignature.deadline,
          nonce: storedSignature.nonce,
          signature: parsedSig,
        };
        params = spokeParams;
      }

      logger.contract.debug('Transaction acknowledgement params', {
        dataHash,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        isHub,
        isSpoke,
        transactionHashesSample: txHashesForContractGuarded?.slice(0, 10),
        chainIds: chainIdsForContractGuarded?.slice(0, 2),
      });

      await submitAcknowledgement(params);

      logger.contract.info(
        'Transaction batch acknowledgement transaction submitted, waiting for confirmation'
      );
    } catch (err) {
      logger.contract.error(
        'Transaction batch acknowledgement transaction failed',
        {
          error: err instanceof Error ? err.message : String(err),
          dataHash,
        },
        err instanceof Error ? err : undefined
      );
      setLocalError(sanitizeErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    storedSignature,
    dataHash,
    reportedChainIdHash,
    selectedTxHashes,
    txHashesForContractGuarded,
    chainIdsForContractGuarded,
    address,
    chainId,
    submitAcknowledgement,
    registrationType,
    expectedWallet,
    isCorrectWallet,
    isHub,
    isSpoke,
    isSignatureReviewBlocking,
    signatureReview,
  ]);

  /**
   * Handle retry after failure.
   *
   * Plain retry for anything a resubmit can fix. For a signature-invalidating revert the
   * stored signature is discarded and the user is sent back to sign — retrying it would
   * resubmit identical bytes forever.
   */
  const handleRetry = () => {
    if (retryAction.kind === 'request-resign') {
      if (dataHash && formReporter) {
        removeTxSignature(formReporter, dataHash, chainId, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT);
      }
      reset();
      setLocalError(null);

      // P2P relay: the signature is the reporter's, on another machine. Dropping the local
      // copy is only half the recovery — without a request over the wire the reporter sits
      // on a "waiting for the relayer" screen forever. The relayer also has to move back to
      // `select-transactions`, the only step at which `isTxRelayerProtocolExpectedAtStep`
      // admits a fresh TX_ACK_SIG; a re-signature arriving anywhere else is dropped.
      if (isP2PRelayed) {
        logger.contract.warn(
          'Relayed transaction acknowledgement signature invalidated by revert; requesting a new one from the reporter',
          { dataHash, error: error?.message }
        );
        setStoredSignature(null);
        setResignRequest({ notified: null, ack: null });

        // Armed BEFORE the write — see the identical block in `TxRegisterPayStep`.
        armResignAck();

        void sendResignRequest({
          getLibp2p: getLibp2p ?? (() => null),
          partnerPeerId,
          reason: retryAction.reason,
          flow: 'transaction',
        }).then(async (notified) => {
          if (!notified) {
            setResignRequest({ notified: false, ack: null });
            return;
          }

          // A resolved stream write is NOT consent. See `TxRegisterPayStep`.
          const ack = await waitForResignAck();
          setResignRequest({ notified: true, ack });
          if (ack === 'accepted') {
            setResignRequest(null);
            setStep('select-transactions');
          }
        });
        return;
      }

      logger.contract.warn(
        'Transaction acknowledgement signature invalidated by revert, returning to sign',
        { dataHash, error: error?.message }
      );
      const previous = step ? getTxPreviousStep(registrationType, step) : null;
      if (previous) setStep(previous);
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

  // Signature discarded after an invalidating revert on the P2P path. This has to come
  // before the "signature not found" branch below — the signature is legitimately gone, and
  // the reader needs to know why and what their partner has to do, not that something is
  // missing.
  if (resignRequest) {
    return (
      <div className="space-y-4">
        <SignatureInvalidatedAlert
          partner={{ notified: resignRequest.notified, role: 'reporter' }}
        />
        {resignRequest.ack === 'refused' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your partner declined to sign again. They may have hit the limit on re-sign requests,
              or moved on. Contact them directly before continuing.
            </AlertDescription>
          </Alert>
        )}
        {resignRequest.ack === 'timeout' && (
          <Alert>
            <AlertDescription>
              Your partner has not confirmed the request. It may still have reached them — check
              with them directly before waiting for a new signature.
            </AlertDescription>
          </Alert>
        )}
        {(resignRequest.notified === false || resignRequest.ack !== null) &&
          resignRequest.ack !== 'accepted' && (
            <Button variant="outline" size="sm" onClick={() => setStep('select-transactions')}>
              I&apos;ve asked them — wait for a new signature
            </Button>
          )}
      </div>
    );
  }

  // Missing required data
  if (!dataHash || selectedTxHashes.length === 0) {
    return (
      <FlowRecoveryAlert actionLabel="Start Over" onAction={() => setStep('select-transactions')}>
        Missing registration data. Start over to select the transactions you want to report.
      </FlowRecoveryAlert>
    );
  }

  // Signature loading
  if (isSignatureLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">Loading signature data...</span>
      </div>
    );
  }

  // Missing signature (loaded but not found)
  if (!storedSignature) {
    return (
      <FlowRecoveryAlert actionLabel="Back to Signing" onAction={() => setStep('acknowledge-sign')}>
        Signature not found. Go back and sign the acknowledgement again.
      </FlowRecoveryAlert>
    );
  }

  // Get explorer URL
  const explorerUrl = hash ? getExplorerTxUrl(chainId, hash) : null;

  // Get error message
  const errorMessage = localError || (error ? sanitizeErrorMessage(error) : null);

  // Build signed message data for display (storedSignature guaranteed non-null after early return)
  const signedMessageData: SignedMessageData = {
    registeree: storedSignature.reporter,
    trustedForwarder: storedSignature.trustedForwarder,
    nonce: storedSignature.nonce,
    deadline: storedSignature.deadline,
    signature: storedSignature.signature,
  };

  return (
    <div className="space-y-4">
      {/* Wallet switch prompt (self-relay and P2P relay) */}
      {isRelayed && expectedWallet && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={expectedWallet}
          expectedLabel="Gas Wallet"
          currentLabel="Compromised Wallet"
          currentChainId={chainId}
          expectedChainId={chainId}
        />
      )}

      {/* Summary of transaction batch */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm font-medium mb-3">Submitting Acknowledgement</p>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground flex items-center gap-1 shrink-0">
              Transactions:
              <InfoTooltip
                content={
                  <p className="text-xs">
                    The number of transactions included in this fraud report batch.
                  </p>
                }
                side="right"
              />
            </span>
            <span className="font-mono font-medium">{selectedTxHashes.length}</span>
          </div>
          {reportedChainId && (
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                  Reported Chain:
                  <InfoTooltip
                    content={
                      <p className="text-xs">
                        The network where these transactions occurred. The CAIP-2 identifier is
                        hashed on-chain as the <code>reportedChainId</code> field in the EIP-712
                        signed message.
                      </p>
                    }
                    side="right"
                  />
                </span>
                <span className="font-mono font-medium">
                  {getChainName(reportedChainId)}{' '}
                  <span className="text-muted-foreground text-xs">({reportedChainIdCaip2})</span>
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <code className="font-mono text-xs text-muted-foreground break-all cursor-default">
                    {reportedChainIdHash}
                  </code>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-xs">keccak256 hash of "{reportedChainIdCaip2}"</p>
                  <p className="text-xs font-mono break-all mt-1">{reportedChainIdHash}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground flex items-center gap-1 shrink-0">
              Data Hash:
              <InfoTooltip content={DATA_HASH_TOOLTIP} side="right" />
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="font-mono text-xs break-all cursor-default">{dataHash}</code>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                <p className="text-xs font-mono break-all">{dataHash}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Selected Transactions Table */}
      {selectedTxDetails.length > 0 && (
        <SelectedTransactionsTable
          transactions={selectedTxDetails}
          showValue
          showBlock
          reportedChainId={reportedChainId}
        />
      )}

      {needsResign &&
        (isP2PRelayed ? (
          <SignatureInvalidatedAlert partner={{ notified: null, role: 'reporter' }} />
        ) : (
          <SignatureInvalidatedAlert />
        ))}

      {/* P2P relay: review before you pay */}
      {isP2PRelayed && storedSignature && (
        <RelayedSignatureReview
          review={signatureReview}
          isChecking={isReviewingSignature}
          // The out-of-band wallet, never `.reporter` — that is the peer's own claim, so a
          // panel built from it shows "Signed by: X / You were told: X" for an attacker who
          // signed over its own address, i.e. two matching rows next to a signer-mismatch
          // alert. Gating already used `pairedWallet`; the display now agrees with it.
          expectedSigner={pairedWallet}
          deadline={storedSignature.deadline}
        />
      )}

      {/* Transaction card with cost estimate */}
      <TransactionCard
        type="acknowledgement"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
        chainId={chainId}
        costEstimate={{
          data: {
            protocolFee: null, // No protocol fee for acknowledgement
            bridgeFee: null, // No bridge fee for acknowledgement
            bridgeName: null,
            gasCost: gasEstimate
              ? {
                  wei: gasEstimate.gasCostWei,
                  eth: gasEstimate.gasCostEth,
                  usd: gasEstimate.gasCostUsd,
                  gwei: gasEstimate.gasPriceGwei,
                }
              : {
                  wei: 0n,
                  eth: '—',
                  usd: '—',
                  gwei: '—',
                },
            total: gasEstimate
              ? {
                  wei: gasEstimate.gasCostWei,
                  eth: gasEstimate.gasCostEth,
                  usd: gasEstimate.gasCostUsd,
                }
              : {
                  wei: 0n,
                  eth: '—',
                  usd: '—',
                },
            ethPriceUsd: ethPrice?.usdFormatted ?? '—',
            isCrossChain: false,
          } as TransactionCost,
          isLoading: gasLoading,
          isError: gasError,
          refetch: refetchGas,
        }}
        onSubmit={handleSubmit}
        onRetry={handleRetry}
        disabled={!isCorrectWallet || isSignatureReviewBlocking}
      />

      {/* Disabled state message when wrong wallet connected */}
      {!isCorrectWallet && getStatus() === 'idle' && (
        <p className="text-sm text-muted-foreground text-center">
          Switch to the correct wallet above to submit the transaction.
        </p>
      )}
    </div>
  );
}
