/**
 * Transaction batch acknowledgement payment step.
 *
 * Submits the acknowledgement transaction using the stored signature.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import {
  TransactionCard,
  type TransactionStatus,
  type SignedMessageData,
} from '@/components/composed/TransactionCard';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { areAddressesEqual } from '@/lib/address';
import { useTransactionSelection } from '@/stores/transactionFormStore';
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
  TX_SIGNATURE_STEP,
  computeTransactionDataHash,
} from '@/lib/signatures/transactions';
import type { Hash } from '@/lib/types/ethereum';
import { parseSignature } from '@/lib/signatures';
import { chainIdToBytes32, toCAIP2, getChainName } from '@swr/chains';
import { DATA_HASH_TOOLTIP } from '@/lib/utils';
import { getExplorerTxUrl } from '@/lib/explorer';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface TxAcknowledgePayStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Transaction batch acknowledgement payment step - submits the ACK transaction.
 */
export function TxAcknowledgePayStep({ onComplete }: TxAcknowledgePayStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registrationType, setAcknowledgementHash } = useTransactionRegistrationStore();
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

  // SSR-safe signature retrieval - sessionStorage not available during SSR
  // Use undefined for "not yet loaded" vs null for "loaded but not found"
  const [storedSignature, setStoredSignature] = useState<
    ReturnType<typeof getTxSignature> | undefined
  >(undefined);

  useEffect(() => {
    if (dataHash) {
      setStoredSignature(getTxSignature(dataHash, chainId, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT));
    } else {
      setStoredSignature(null);
    }
  }, [dataHash, chainId]);

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
  ]);

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

  // Missing required data
  if (!dataHash || selectedTxHashes.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Missing registration data. Please start over from the beginning.
        </AlertDescription>
      </Alert>
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
        disabled={!isCorrectWallet}
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
