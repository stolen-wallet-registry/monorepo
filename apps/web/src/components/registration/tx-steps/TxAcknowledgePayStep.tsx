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
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { useTransactionSelection } from '@/stores/transactionFormStore';
import { useTransactionAcknowledgement, type TxAcknowledgementParams } from '@/hooks/transactions';
import { getTxSignature, TX_SIGNATURE_STEP } from '@/lib/signatures/transactions';
import { parseSignature } from '@/lib/signatures';
import { chainIdToCAIP2, chainIdToCAIP2String, getChainName } from '@/lib/caip';
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
  const { setAcknowledgementHash } = useTransactionRegistrationStore();
  const { selectedTxHashes, selectedTxDetails, reportedChainId, merkleRoot } =
    useTransactionSelection();

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

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Get stored signature
  const storedSignature = merkleRoot
    ? getTxSignature(merkleRoot, chainId, TX_SIGNATURE_STEP.ACKNOWLEDGEMENT)
    : null;

  // Convert reported chain ID to CAIP-2 format
  const reportedChainIdHash = reportedChainId ? chainIdToCAIP2(reportedChainId) : undefined;

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
    logger.contract.info('Transaction batch acknowledgement submission initiated', {
      merkleRoot,
      transactionCount: selectedTxHashes.length,
      hasStoredSignature: !!storedSignature,
      connectedWallet: address,
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

      // Build chain IDs array (all same chain for now)
      const chainIds = selectedTxHashes.map(() => reportedChainIdHash);

      logger.contract.info('Submitting transaction batch acknowledge to contract', {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        deadline: storedSignature.deadline.toString(),
        chainId,
      });

      const params: TxAcknowledgementParams = {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        transactionHashes: selectedTxHashes,
        chainIds,
        reporter: storedSignature.reporter,
        deadline: storedSignature.deadline,
        signature: parsedSig,
      };

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
    storedSignature,
    merkleRoot,
    reportedChainIdHash,
    selectedTxHashes,
    address,
    chainId,
    submitAcknowledgement,
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
  const errorMessage = localError || (error ? sanitizeErrorMessage(error) : null);

  // Build signed message data for display
  const signedMessageData: SignedMessageData | null = storedSignature
    ? {
        registeree: storedSignature.reporter,
        forwarder: storedSignature.forwarder,
        nonce: storedSignature.nonce,
        deadline: storedSignature.deadline,
        signature: storedSignature.signature,
      }
    : null;

  return (
    <div className="space-y-4">
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
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                Reported Chain ID:
                <InfoTooltip
                  content={
                    <p className="text-xs">
                      The CAIP-2 formatted chain identifier where these transactions occurred. This
                      is hashed on-chain as{' '}
                      <code className="text-[10px]">
                        keccak256("{chainIdToCAIP2String(reportedChainId)}")
                      </code>
                      .
                    </p>
                  }
                  side="right"
                />
              </span>
              <span className="font-mono font-medium">
                {getChainName(reportedChainId)}{' '}
                <span className="text-muted-foreground text-xs">
                  ({chainIdToCAIP2String(reportedChainId)})
                </span>
              </span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground flex items-center gap-1 shrink-0">
              Merkle Root:
              <InfoTooltip
                content={
                  <p className="text-xs">
                    A cryptographic hash representing all selected transactions. This is stored
                    on-chain as tamper-proof evidence of your fraud report.
                  </p>
                }
                side="right"
              />
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
        <SelectedTransactionsTable transactions={selectedTxDetails} showValue showBlock />
      )}

      {/* Transaction card */}
      <TransactionCard
        type="acknowledgement"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
        chainId={chainId}
        onSubmit={handleSubmit}
        onRetry={handleRetry}
      />
    </div>
  );
}
