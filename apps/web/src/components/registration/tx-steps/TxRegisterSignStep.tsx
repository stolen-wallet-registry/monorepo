/**
 * Transaction batch registration signing step.
 *
 * Signs the registration message after the grace period.
 */

import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { useTransactionSelection } from '@/stores/transactionFormStore';
import {
  useSignTxEIP712,
  useTransactionRegistrationHashStruct,
  useTxContractNonce,
} from '@/hooks/transactions';
import { storeTxSignature, TX_SIGNATURE_STEP } from '@/lib/signatures/transactions';
import { chainIdToCAIP2 } from '@/lib/caip';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import type { Hex } from '@/lib/types/ethereum';
import { AlertCircle, Loader2 } from 'lucide-react';

export interface TxRegisterSignStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Transaction batch registration signing step - signs the REG message.
 */
export function TxRegisterSignStep({ onComplete }: TxRegisterSignStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { selectedTxHashes, reportedChainId, merkleRoot } = useTransactionSelection();

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
  const reportedChainIdHash = reportedChainId ? chainIdToCAIP2(reportedChainId) : undefined;

  // Contract hooks
  const { nonce, isLoading: nonceLoading, isError: nonceError } = useTxContractNonce(address);

  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useTransactionRegistrationHashStruct(
    merkleRoot ?? undefined,
    reportedChainIdHash,
    selectedTxHashes.length,
    address // forwarder is connected wallet for standard registration
  );

  const { signTxRegistration, reset: resetSigning } = useSignTxEIP712();

  const isContractDataLoading = nonceLoading || hashLoading;
  const hasContractError = nonceError || hashError;

  /**
   * Handle signing the registration.
   */
  const handleSign = async () => {
    logger.signature.info('Transaction batch registration sign requested', {
      merkleRoot,
      hasHashStructData: !!hashStructData,
      hasNonce: nonce !== undefined,
      connectedAddress: address,
    });

    if (!address || !merkleRoot || !reportedChainIdHash || nonce === undefined) {
      logger.signature.error('Missing required data for transaction registration signing', {
        address,
        merkleRoot,
        reportedChainIdHash,
        hashStructData: !!hashStructData,
        nonce,
      });
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    // Refetch to get fresh deadline
    logger.contract.debug('Refetching hash struct for fresh registration deadline');
    const refetchResult = await refetchHashStruct();
    const rawData = refetchResult?.data;
    const freshDeadline =
      Array.isArray(rawData) && typeof rawData[0] === 'bigint'
        ? rawData[0]
        : hashStructData?.deadline;

    if (freshDeadline === undefined) {
      logger.signature.error('Failed to get hash struct data');
      setSignatureError('Failed to load signing data. Please try again.');
      setSignatureStatus('error');
      return;
    }

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      logger.signature.info('Requesting EIP-712 transaction batch registration signature', {
        merkleRoot,
        forwarder: address,
        nonce: nonce.toString(),
        deadline: freshDeadline.toString(),
        chainId,
      });

      const sig = await signTxRegistration({
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        forwarder: address,
        nonce,
        deadline: freshDeadline,
      });

      logger.signature.info('Transaction batch registration signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
      });

      // Store signature
      storeTxSignature({
        signature: sig,
        deadline: freshDeadline,
        nonce,
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        reporter: address,
        forwarder: address,
        chainId,
        step: TX_SIGNATURE_STEP.REGISTRATION,
        storedAt: Date.now(),
      });
      logger.signature.debug('Transaction batch registration signature stored in sessionStorage');

      setSignature(sig);
      setSignatureStatus('success');

      logger.registration.info(
        'Transaction batch registration signing complete, advancing to payment step'
      );
      // Clear any existing timeout before setting a new one
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
      // Advance to next step after short delay
      completionTimeoutRef.current = setTimeout(onComplete, 1000);
    } catch (err) {
      logger.signature.error(
        'Transaction batch registration signing failed',
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

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm font-medium mb-2">Ready to Register</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Transactions:</span>
          <span className="font-mono">{selectedTxHashes.length}</span>
          <span className="text-muted-foreground">Merkle Root:</span>
          <span className="font-mono text-xs truncate" title={merkleRoot}>
            {merkleRoot.slice(0, 10)}...{merkleRoot.slice(-8)}
          </span>
        </div>
      </div>

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
          <AlertDescription>Failed to load contract data. Please try again.</AlertDescription>
        </Alert>
      )}

      {/* Signature card */}
      {!isContractDataLoading && !hasContractError && hashStructData && nonce !== undefined && (
        <SignatureCard
          type="registration"
          data={{
            registeree: address,
            forwarder: address,
            nonce,
            deadline: hashStructData.deadline,
            chainId,
          }}
          status={signatureStatus}
          error={signatureError}
          signature={signature}
          onSign={handleSign}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
