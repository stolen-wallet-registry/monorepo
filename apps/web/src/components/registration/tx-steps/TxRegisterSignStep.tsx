/**
 * Transaction batch registration signing step.
 *
 * Signs the registration message after the grace period.
 */

import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { areAddressesEqual } from '@/lib/address';
import {
  useSignTxEIP712,
  useTransactionRegistrationHashStruct,
  useTxContractNonce,
} from '@/hooks/transactions';
import { storeTxSignature, TX_SIGNATURE_STEP } from '@/lib/signatures/transactions';
import { chainIdToCAIP2, chainIdToCAIP2String, getChainName } from '@/lib/caip';
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
  const { selectedTxHashes, selectedTxDetails, reportedChainId, merkleRoot } =
    useTransactionSelection();
  const { registrationType } = useTransactionRegistrationStore();
  const storedReporter = useTransactionFormStore((s) => s.reporter);
  const storedForwarder = useTransactionFormStore((s) => s.forwarder);

  const isSelfRelay = registrationType === 'selfRelay';
  // For self-relay, use stored addresses; otherwise use connected wallet for both
  const reporterAddress = isSelfRelay && storedReporter ? storedReporter : address;
  const forwarderAddress = isSelfRelay && storedForwarder ? storedForwarder : address;

  // In self-relay, the reporter wallet must be connected to sign
  // The reporter is the one who signs, not the forwarder
  const isCorrectWallet = isSelfRelay
    ? Boolean(address && reporterAddress && areAddressesEqual(address, reporterAddress))
    : true; // For standard, current wallet is always correct

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

  // Contract hooks - use reporter address for nonce since they're the signer
  const {
    nonce,
    isLoading: nonceLoading,
    isError: nonceError,
  } = useTxContractNonce(reporterAddress);

  const {
    data: hashStructData,
    isLoading: hashLoading,
    isError: hashError,
    refetch: refetchHashStruct,
  } = useTransactionRegistrationHashStruct(
    merkleRoot ?? undefined,
    reportedChainIdHash,
    selectedTxHashes.length,
    forwarderAddress ?? undefined // forwarder from store for self-relay, connected wallet for standard
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
      forwarder: forwarderAddress,
      isSelfRelay,
    });

    if (
      !address ||
      !merkleRoot ||
      !reportedChainIdHash ||
      nonce === undefined ||
      !forwarderAddress
    ) {
      logger.signature.error('Missing required data for transaction registration signing', {
        address,
        merkleRoot,
        reportedChainIdHash,
        hashStructData: !!hashStructData,
        nonce,
        forwarderAddress,
      });
      setSignatureError('Missing required data for signing');
      setSignatureStatus('error');
      return;
    }

    // Refetch to get fresh deadline - do not use stale data
    logger.contract.debug('Refetching hash struct for fresh registration deadline');
    const refetchResult = await refetchHashStruct();
    const rawData = refetchResult?.data;

    // Require fresh deadline - do not fall back to stale hashStructData
    if (!Array.isArray(rawData) || typeof rawData[0] !== 'bigint') {
      logger.signature.error('Failed to get fresh hash struct data', {
        hasData: !!rawData,
        dataType: Array.isArray(rawData) ? 'array' : typeof rawData,
      });
      setSignatureError('Failed to load fresh signing data. Please try again.');
      setSignatureStatus('error');
      return;
    }

    const freshDeadline = rawData[0];

    setSignatureStatus('signing');
    setSignatureError(null);

    try {
      logger.signature.info('Requesting EIP-712 transaction batch registration signature', {
        merkleRoot,
        reporter: address,
        forwarder: forwarderAddress,
        isSelfRelay,
        nonce: nonce.toString(),
        deadline: freshDeadline.toString(),
        chainId,
      });

      const sig = await signTxRegistration({
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        forwarder: forwarderAddress,
        nonce,
        deadline: freshDeadline,
      });

      logger.signature.info('Transaction batch registration signature obtained', {
        signaturePreview: `${sig.slice(0, 10)}...${sig.slice(-8)}`,
      });

      // Set signature state first so UI reflects success even if storage fails
      setSignature(sig);
      setSignatureStatus('success');

      // Store signature - don't let storage failure discard the signature
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
          step: TX_SIGNATURE_STEP.REGISTRATION,
          storedAt: Date.now(),
        });
        logger.signature.debug('Transaction batch registration signature stored in sessionStorage');
      } catch (storageErr) {
        logger.signature.error(
          'Failed to store signature in sessionStorage',
          { error: storageErr instanceof Error ? storageErr.message : String(storageErr) },
          storageErr instanceof Error ? storageErr : undefined
        );
        // Don't rethrow - signature is still valid and usable
      }

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
      {/* Wallet switch prompt (self-relay only) - user must switch back to reporter wallet */}
      {isSelfRelay && reporterAddress && (
        <WalletSwitchPrompt
          currentAddress={address}
          expectedAddress={reporterAddress}
          expectedLabel="Reporter Wallet"
          currentLabel="Gas Wallet"
          currentChainId={chainId}
          expectedChainId={chainId}
        />
      )}

      {/* Summary */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm font-medium mb-3">Ready to Register</p>
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
                    ({chainIdToCAIP2String(reportedChainId)})
                  </span>
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <code className="font-mono text-xs text-muted-foreground break-all cursor-default">
                    {chainIdToCAIP2(reportedChainId)}
                  </code>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-xs">
                    keccak256 hash of "{chainIdToCAIP2String(reportedChainId)}"
                  </p>
                  <p className="text-xs font-mono break-all mt-1">
                    {chainIdToCAIP2(reportedChainId)}
                  </p>
                </TooltipContent>
              </Tooltip>
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
      {!isContractDataLoading &&
        !hasContractError &&
        hashStructData &&
        nonce !== undefined &&
        reporterAddress &&
        forwarderAddress && (
          <SignatureCard
            type="registration"
            data={{
              registeree: reporterAddress,
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
            disabled={!isCorrectWallet}
          />
        )}

      {/* Message when wrong wallet connected */}
      {isSelfRelay && !isCorrectWallet && signatureStatus === 'idle' && (
        <p className="text-sm text-muted-foreground text-center">
          Switch to your reporter wallet above to sign the registration.
        </p>
      )}
    </div>
  );
}
