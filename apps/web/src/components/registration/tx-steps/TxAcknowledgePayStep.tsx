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
} from '@/hooks/transactions';
import type { TransactionCost } from '@/hooks/useTransactionCost';
import { useEthPrice } from '@/hooks/useEthPrice';
import { getTxSignature, TX_SIGNATURE_STEP } from '@/lib/signatures/transactions';
import { parseSignature } from '@/lib/signatures';
import { chainIdToBytes32, toCAIP2, getChainName } from '@swr/chains';
import { MERKLE_ROOT_TOOLTIP } from '@/lib/utils';
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
    merkleRoot,
    sortedTxHashes,
    sortedChainIds,
  } = useTransactionSelection();

  const isSelfRelay = registrationType === 'selfRelay';

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
    if (merkleRoot) {
      setStoredSignature(getTxSignature(merkleRoot, chainId, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT));
    } else {
      setStoredSignature(null);
    }
  }, [merkleRoot, chainId]);

  // Signature is still loading from sessionStorage
  const isSignatureLoading = storedSignature === undefined;

  // Expected wallet for this step: forwarder (gas wallet) for self-relay, reporter for standard
  const expectedWallet = storedSignature
    ? isSelfRelay
      ? storedSignature.forwarder
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

  // Use sorted hashes and chain IDs from merkle tree for contract calls
  // These must match the order used to compute the merkle root
  // Guard against undefined during store hydration
  const txHashesForContract =
    sortedTxHashes && sortedTxHashes.length > 0 ? sortedTxHashes : undefined;
  const chainIdsForContract =
    sortedChainIds && sortedChainIds.length > 0 ? sortedChainIds : undefined;

  // Parse signature for gas estimation
  const parsedSigForEstimate = storedSignature
    ? parseSignature(storedSignature.signature)
    : undefined;

  // Get gas estimate (acknowledgement step - no fees, just gas)
  const {
    data: gasEstimate,
    isLoading: gasLoading,
    isError: gasError,
    refetch: refetchGas,
  } = useTxGasEstimate({
    step: 'acknowledgement',
    merkleRoot: merkleRoot ?? undefined,
    reportedChainId: reportedChainIdHash,
    transactionCount: selectedTxHashes.length,
    transactionHashes: txHashesForContract,
    chainIds: chainIdsForContract,
    reporter: storedSignature?.reporter,
    deadline: storedSignature?.deadline,
    signature: parsedSigForEstimate,
    enabled:
      !!storedSignature &&
      !!merkleRoot &&
      !!reportedChainIdHash &&
      !!txHashesForContract &&
      !!chainIdsForContract &&
      isCorrectWallet, // Only estimate gas when correct wallet is connected
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
        merkleRoot,
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
  }, [
    isConfirmed,
    hash,
    setAcknowledgementHash,
    chainId,
    onComplete,
    merkleRoot,
    selectedTxHashes,
  ]);

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
      merkleRoot,
      transactionCount: selectedTxHashes.length,
      hasStoredSignature: !!storedSignature,
      registrationType,
      connectedWallet: address,
      expectedWallet,
      isCorrectWallet,
    });

    if (!storedSignature || !merkleRoot || !reportedChainIdHash) {
      logger.contract.error('Cannot submit transaction acknowledgement - missing data', {
        hasStoredSignature: !!storedSignature,
        merkleRoot,
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

      // Validate sorted data is available
      if (!txHashesForContract || !chainIdsForContract) {
        logger.contract.error('Missing sorted transaction data for acknowledgement', {
          hasSortedTxHashes: !!txHashesForContract,
          hasSortedChainIds: !!chainIdsForContract,
        });
        setLocalError('Transaction data not ready. Please go back and try again.');
        return;
      }

      logger.contract.info('Submitting transaction batch acknowledge to contract', {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        deadline: storedSignature.deadline.toString(),
        chainId,
        // Log sorted hashes for debugging merkle root mismatch
        sortedTxHashesCount: txHashesForContract?.length,
        firstSortedTxHash: txHashesForContract?.[0],
        lastSortedTxHash: txHashesForContract?.[txHashesForContract?.length - 1],
        firstSortedChainId: chainIdsForContract?.[0],
      });

      const params: TxAcknowledgementParams = {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        transactionHashes: txHashesForContract,
        chainIds: chainIdsForContract,
        reporter: storedSignature.reporter,
        deadline: storedSignature.deadline,
        signature: parsedSig,
      };

      // Debug log to trace merkle root mismatch issues
      logger.contract.debug('Transaction acknowledgement params', {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: params.transactionCount,
        // Log capped sample to keep logs manageable in stress tests
        transactionHashesSample: txHashesForContract?.slice(0, 10),
        chainIds: chainIdsForContract?.slice(0, 2), // Just first 2 to keep log readable
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
          merkleRoot,
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
    merkleRoot,
    reportedChainIdHash,
    selectedTxHashes,
    txHashesForContract,
    chainIdsForContract,
    address,
    chainId,
    submitAcknowledgement,
    registrationType,
    expectedWallet,
    isCorrectWallet,
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
  if (!merkleRoot || selectedTxHashes.length === 0) {
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
    forwarder: storedSignature.forwarder,
    nonce: storedSignature.nonce,
    deadline: storedSignature.deadline,
    signature: storedSignature.signature,
  };

  return (
    <div className="space-y-4">
      {/* Wallet switch prompt (self-relay only) */}
      {isSelfRelay && expectedWallet && (
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
              Merkle Root:
              <InfoTooltip content={MERKLE_ROOT_TOOLTIP} side="right" />
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="font-mono text-xs break-all cursor-default">{merkleRoot}</code>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                <p className="text-xs font-mono break-all">{merkleRoot}</p>
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
