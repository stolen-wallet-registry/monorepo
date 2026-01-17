/**
 * Transaction batch registration payment step.
 *
 * Submits the registration transaction using the stored signature.
 */

import { useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { Alert, AlertDescription, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import {
  TransactionCard,
  type TransactionStatus,
  type SignedMessageData,
} from '@/components/composed/TransactionCard';
import type { TransactionCost } from '@/hooks/useTransactionCost';
import { useEthPrice } from '@/hooks/useEthPrice';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { useTransactionSelection } from '@/stores/transactionFormStore';
import {
  useTransactionRegistration,
  useTxQuoteFee,
  useTxGasEstimate,
  type TxRegistrationParams,
} from '@/hooks/transactions';
import { getTxSignature, TX_SIGNATURE_STEP } from '@/lib/signatures/transactions';
import { parseSignature } from '@/lib/signatures';
import { chainIdToCAIP2, chainIdToCAIP2String, getChainName } from '@/lib/caip';
import { getExplorerTxUrl } from '@/lib/explorer';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface TxRegisterPayStepProps {
  /** Called when step is complete */
  onComplete: () => void;
}

/**
 * Transaction batch registration payment step - submits the REG transaction.
 */
export function TxRegisterPayStep({ onComplete }: TxRegisterPayStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { setRegistrationHash } = useTransactionRegistrationStore();
  const { selectedTxHashes, selectedTxDetails, reportedChainId, merkleRoot } =
    useTransactionSelection();

  // Contract hooks
  const { submitRegistration, hash, isPending, isConfirming, isConfirmed, isError, error, reset } =
    useTransactionRegistration();

  // Get registration fee
  const {
    feeWei,
    data: feeData,
    isLoading: feeLoading,
    isError: feeError,
    refetch: refetchFee,
  } = useTxQuoteFee(address);

  // Get ETH price for cost display
  const { data: ethPrice } = useEthPrice();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [storedSignatureState, setStoredSignatureState] = useState<ReturnType<
    typeof getTxSignature
  > | null>(null);

  // Get stored signature (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!merkleRoot) {
      setStoredSignatureState(null);
      return;
    }
    setStoredSignatureState(getTxSignature(merkleRoot, chainId, TX_SIGNATURE_STEP.REGISTRATION));
  }, [merkleRoot, chainId]);

  // Convert reported chain ID to CAIP-2 format
  const reportedChainIdHash = reportedChainId ? chainIdToCAIP2(reportedChainId) : undefined;

  // Build chain IDs array for gas estimation
  const chainIdsArray = reportedChainIdHash
    ? selectedTxHashes.map(() => reportedChainIdHash)
    : undefined;

  // Parse signature for gas estimation (need the parsed v, r, s values)
  const parsedSigForEstimate = storedSignatureState
    ? parseSignature(storedSignatureState.signature)
    : undefined;

  // Get gas estimate
  const {
    data: gasEstimate,
    isLoading: gasLoading,
    isError: gasError,
    refetch: refetchGas,
  } = useTxGasEstimate({
    step: 'registration',
    merkleRoot: merkleRoot ?? undefined,
    reportedChainId: reportedChainIdHash,
    transactionHashes: selectedTxHashes.length > 0 ? selectedTxHashes : undefined,
    chainIds: chainIdsArray,
    reporter: storedSignatureState?.reporter,
    deadline: storedSignatureState?.deadline,
    signature: parsedSigForEstimate,
    value: feeWei,
    enabled: !!storedSignatureState && !!merkleRoot && !!reportedChainIdHash && !!feeWei,
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
      logger.contract.info('Transaction batch registration transaction confirmed', {
        hash,
        merkleRoot,
        transactionCount: selectedTxHashes.length,
      });
      setRegistrationHash(hash, chainId);
      logger.registration.info(
        'Transaction batch registration complete! Transactions successfully registered.',
        {
          merkleRoot,
          transactionCount: selectedTxHashes.length,
          transactionHash: hash,
        }
      );
      // Advance to success step after delay
      const timerId = setTimeout(onComplete, 1500);
      return () => clearTimeout(timerId);
    }
  }, [
    isConfirmed,
    hash,
    setRegistrationHash,
    chainId,
    onComplete,
    merkleRoot,
    selectedTxHashes.length,
  ]);

  /**
   * Submit the registration transaction.
   */
  const handleSubmit = async () => {
    if (isSubmitting || isPending || isConfirming) {
      return;
    }

    logger.contract.info('Transaction batch registration submission initiated', {
      merkleRoot,
      transactionCount: selectedTxHashes.length,
      hasStoredSignature: !!storedSignatureState,
      connectedWallet: address,
    });

    if (!storedSignatureState || !merkleRoot || !reportedChainIdHash) {
      logger.contract.error('Cannot submit transaction registration - missing data', {
        hasStoredSignature: !!storedSignatureState,
        merkleRoot,
        reportedChainIdHash,
      });
      setLocalError('Missing signature data. Please go back and sign again.');
      return;
    }

    // Guard: Ensure valid fee quote is available to avoid underpayment revert
    if (feeWei === undefined || feeLoading || feeError) {
      logger.contract.error('Cannot submit transaction registration - fee quote unavailable', {
        feeWei: feeWei?.toString(),
        feeLoading,
        feeError,
      });
      setLocalError('Fee quote unavailable. Please retry.');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const parsedSig = parseSignature(storedSignatureState.signature);

      // Build chain IDs array (all same chain for now)
      const chainIds = selectedTxHashes.map(() => reportedChainIdHash);

      logger.contract.info('Submitting transaction batch register to contract', {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        deadline: storedSignatureState.deadline.toString(),
        chainId,
        feeWei: feeWei.toString(),
      });

      const params: TxRegistrationParams = {
        merkleRoot,
        reportedChainId: reportedChainIdHash,
        transactionHashes: selectedTxHashes,
        chainIds,
        reporter: storedSignatureState.reporter,
        deadline: storedSignatureState.deadline,
        signature: parsedSig,
        feeWei,
      };

      await submitRegistration(params);

      logger.contract.info(
        'Transaction batch registration transaction submitted, waiting for confirmation'
      );
    } catch (err) {
      logger.contract.error(
        'Transaction batch registration transaction failed',
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
  if (!storedSignatureState) {
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

  // Get error message
  const errorMessage = localError || (error ? sanitizeErrorMessage(error) : null);

  // Build signed message data for display
  const signedMessageData: SignedMessageData | null = storedSignatureState
    ? {
        registeree: storedSignatureState.reporter,
        forwarder: storedSignatureState.forwarder,
        nonce: storedSignatureState.nonce,
        deadline: storedSignatureState.deadline,
        signature: storedSignatureState.signature,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm font-medium mb-3">Submitting Registration</p>
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

      {/* Transaction card with cost breakdown */}
      <TransactionCard
        type="registration"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
        chainId={chainId}
        costEstimate={
          feeData
            ? {
                data: {
                  protocolFee: {
                    wei: feeData.feeWei,
                    eth: feeData.feeEth,
                    usd: feeData.feeUsd,
                  },
                  bridgeFee: null,
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
                        wei: feeData.feeWei + gasEstimate.gasCostWei,
                        eth: `${(Number(feeData.feeWei + gasEstimate.gasCostWei) / 1e18).toFixed(8)}`,
                        usd: `$${(((Number(feeData.feeWei + gasEstimate.gasCostWei) / 1e18) * (ethPrice?.usdCents ?? 0)) / 100).toFixed(2)}`,
                      }
                    : {
                        wei: feeData.feeWei,
                        eth: feeData.feeEth,
                        usd: feeData.feeUsd,
                      },
                  ethPriceUsd: ethPrice?.usdFormatted ?? '—',
                  isCrossChain: false,
                } as TransactionCost,
                isLoading: feeLoading || gasLoading,
                isError: feeError || gasError,
                refetch: () => {
                  refetchFee();
                  refetchGas();
                },
              }
            : undefined
        }
        onSubmit={handleSubmit}
        onRetry={handleRetry}
      />
    </div>
  );
}
