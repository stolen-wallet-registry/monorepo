/**
 * Transaction batch acknowledgement signing step.
 *
 * Signs the EIP-712 acknowledgement message for transaction batch registration.
 */

import { useState, useRef, useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription, Button, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import {
  useSignTxEIP712,
  useTransactionAcknowledgementHashStruct,
  useTxContractNonce,
} from '@/hooks/transactions';
import { storeTxSignature, TX_SIGNATURE_STEP } from '@/lib/signatures/transactions';
import { chainIdToBytes32, toCAIP2, getChainName } from '@swr/chains';
import { MERKLE_ROOT_TOOLTIP } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import type { Hex } from '@/lib/types/ethereum';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

export interface TxAcknowledgeSignStepProps {
  /** Called when step is complete */
  onComplete: () => void;
  /** Called to go back to previous step */
  onBack?: () => void;
}

/**
 * Transaction acknowledgement signing step.
 */
export function TxAcknowledgeSignStep({ onComplete, onBack }: TxAcknowledgeSignStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { selectedTxHashes, selectedTxDetails, reportedChainId, merkleRoot } =
    useTransactionSelection();
  const { registrationType } = useTransactionRegistrationStore();
  const storedForwarder = useTransactionFormStore((s) => s.forwarder);

  const isSelfRelay = registrationType === 'selfRelay';
  // For self-relay, use the stored forwarder; otherwise use connected wallet
  const forwarderAddress = isSelfRelay && storedForwarder ? storedForwarder : address;

  // Local state
  const [signatureStatus, setSignatureStatus] = useState<SignatureStatus>('idle');
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

  // Ref for timeout cleanup
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  // Convert reported chain ID to CAIP-2 format
  const reportedChainIdHash = reportedChainId ? chainIdToBytes32(reportedChainId) : undefined;

  // Contract hooks
  const { nonce, isLoading: nonceLoading, isError: nonceError } = useTxContractNonce(address);

  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useTransactionAcknowledgementHashStruct(
    merkleRoot ?? undefined,
    reportedChainIdHash,
    selectedTxHashes.length,
    forwarderAddress ?? undefined // forwarder from store for self-relay, connected wallet for standard
  );

  const { signTxAcknowledgement, isPending: isSigning, reset: resetSigning } = useSignTxEIP712();

  const isContractDataLoading = nonceLoading || hashLoading;
  const hasContractError = nonceError || hashError;

  /**
   * Handle signing the acknowledgement.
   */
  const handleSign = async () => {
    logger.signature.info('Transaction batch acknowledgement sign requested', {
      hasAddress: !!address,
      hasMerkleRoot: !!merkleRoot,
      hasHashStructData: !!hashStructData,
      hasNonce: nonce !== undefined,
      transactionCount: selectedTxHashes.length,
    });

    if (
      !address ||
      nonce === undefined ||
      !merkleRoot ||
      !reportedChainIdHash ||
      !forwarderAddress
    ) {
      logger.signature.error('Missing required data for transaction acknowledgement signing', {
        address,
        merkleRoot,
        hashStructData: !!hashStructData,
        nonce,
      });
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    // Refetch hash struct to get fresh deadline
    logger.contract.debug('Refetching hash struct for fresh deadline');
    const refetchResult = await refetchHashStruct();
    // Extract deadline from refetch result - data shape matches TxHashStructData
    const refetchedDeadline =
      refetchResult?.data &&
      typeof refetchResult.data === 'object' &&
      'deadline' in refetchResult.data
        ? (refetchResult.data.deadline as bigint)
        : undefined;
    const freshDeadline = refetchedDeadline ?? hashStructData?.deadline;

    if (freshDeadline === undefined) {
      logger.signature.error('Failed to get hash struct data');
      setSignatureError('Failed to load signing data. Please try again.');
      setSignatureStatus('error');
      return;
    }

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      logger.signature.info('Requesting EIP-712 transaction batch acknowledgement signature', {
        merkleRoot,
        transactionCount: selectedTxHashes.length,
        reporter: address,
        forwarder: forwarderAddress,
        isSelfRelay,
        nonce: nonce.toString(),
        deadline: freshDeadline.toString(),
        chainId,
      });

      const sig = await signTxAcknowledgement({
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        forwarder: forwarderAddress,
        nonce,
        deadline: freshDeadline,
      });

      logger.signature.info('Transaction batch acknowledgement signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
      });

      // Set signature state first so UI reflects success even if storage fails.
      setSignature(sig);
      setSignatureStatus('success');

      // Store signature without letting storage failure discard the signature.
      try {
        storeTxSignature({
          signature: sig,
          deadline: freshDeadline,
          nonce,
          merkleRoot,
          reportedChainId: reportedChainIdHash,
          transactionCount: selectedTxHashes.length,
          reporter: address,
          forwarder: forwarderAddress,
          chainId,
          step: TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
          storedAt: Date.now(),
        });
        logger.signature.debug(
          'Transaction batch acknowledgement signature stored in sessionStorage'
        );
      } catch (storageErr) {
        logger.signature.error(
          'Failed to store signature in sessionStorage',
          { error: storageErr instanceof Error ? storageErr.message : String(storageErr) },
          storageErr instanceof Error ? storageErr : undefined
        );
      }

      logger.registration.info(
        'Transaction batch acknowledgement signing complete, advancing to next step'
      );
      // Clear any existing timeout before setting a new one
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
      // Advance to next step after short delay
      completionTimeoutRef.current = setTimeout(onComplete, 1000);
    } catch (err) {
      logger.signature.error(
        'Transaction batch acknowledgement signing failed',
        { error: err instanceof Error ? err.message : String(err) },
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

  // If not connected, show error
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
          No transactions selected. Please go back and select transactions to report.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back button */}
      {onBack && (
        <Button
          variant="outline"
          onClick={() => {
            // Clear pending completion timeout
            if (completionTimeoutRef.current) {
              clearTimeout(completionTimeoutRef.current);
              completionTimeoutRef.current = null;
            }
            onBack();
          }}
          disabled={isSigning}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Selection
        </Button>
      )}

      {/* Summary of selected transactions */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm font-medium mb-3">Transaction Batch Summary</p>
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
                  <span className="text-muted-foreground text-xs">
                    ({toCAIP2(reportedChainId)})
                  </span>
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <code className="font-mono text-xs text-muted-foreground break-all cursor-default">
                    {chainIdToBytes32(reportedChainId)}
                  </code>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-xs">keccak256 hash of "{toCAIP2(reportedChainId)}"</p>
                  <p className="text-xs font-mono break-all mt-1">
                    {chainIdToBytes32(reportedChainId)}
                  </p>
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
        <SelectedTransactionsTable transactions={selectedTxDetails} showValue showBlock />
      )}

      {/* Loading state for contract data */}
      {isContractDataLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center py-8 text-muted-foreground"
        >
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Loading contract data...
        </div>
      )}

      {/* Error state for contract data */}
      {hasContractError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load contract data. Please try again.
            <Button variant="link" onClick={() => refetchHashStruct()} className="ml-2 p-0">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Signature card */}
      {!isContractDataLoading &&
        !hasContractError &&
        hashStructData &&
        nonce !== undefined &&
        forwarderAddress && (
          <SignatureCard
            type="acknowledgement"
            data={{
              registeree: address,
              forwarder: forwarderAddress,
              nonce,
              deadline: hashStructData.deadline,
              chainId,
            }}
            status={signatureStatus}
            error={signatureError}
            signature={signature}
            onSign={handleSign}
            onRetry={handleRetry}
            registryType="transaction"
          />
        )}
    </div>
  );
}
