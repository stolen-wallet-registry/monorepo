/**
 * Transaction batch registration payment step.
 *
 * Submits the registration transaction using the stored signature.
 * For spoke chains, waits for cross-chain confirmation on the hub.
 */

import { useEffect, useState } from 'react';
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi';

import { Alert, AlertDescription, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import {
  TransactionCard,
  type TransactionStatus,
  type SignedMessageData,
  type CrossChainProgress,
} from '@/components/composed/TransactionCard';
import { WalletSwitchPrompt } from '@/components/composed/WalletSwitchPrompt';
import type { TransactionCost } from '@/hooks/useTransactionCost';
import { useEthPrice } from '@/hooks/useEthPrice';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { useTransactionRegistrationStore } from '@/stores/transactionRegistrationStore';
import { areAddressesEqual } from '@/lib/address';
import { useTransactionSelection } from '@/stores/transactionFormStore';
import {
  useTransactionRegistration,
  useTxQuoteFeeBreakdown,
  useTxGasEstimate,
  useTxCrossChainConfirmation,
  needsTxCrossChainConfirmation,
  type TxRegistrationParams,
  type TxRegistrationParamsHub,
  type TxRegistrationParamsSpoke,
} from '@/hooks/transactions';
import { isHubChain, isSpokeChain } from '@swr/chains';
import {
  getTxSignature,
  TX_SIGNATURE_STEP,
  computeTransactionDataHash,
} from '@/lib/signatures/transactions';
import type { Hash } from '@/lib/types/ethereum';
import { parseSignature } from '@/lib/signatures';
import { chainIdToBytes32, toCAIP2, getChainName } from '@swr/chains';
import { getHubChainId } from '@/lib/chains/config';
import { DATA_HASH_TOOLTIP } from '@/lib/utils';
import {
  getExplorerTxUrl,
  getChainName as getChainNameFromExplorer,
  getBridgeMessageByIdUrl,
} from '@/lib/explorer';
import { extractBridgeMessageId } from '@/lib/bridge/messageId';
import { logger } from '@/lib/logger';
import { sanitizeErrorMessage, formatEthConsistent, formatCentsToUsd } from '@/lib/utils';
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
  const { registrationType, bridgeMessageId, setRegistrationHash, setBridgeMessageId } =
    useTransactionRegistrationStore();
  const {
    selectedTxHashes,
    selectedTxDetails,
    reportedChainId,
    txHashesForContract,
    chainIdsForContract,
  } = useTransactionSelection();

  const isSelfRelay = registrationType === 'selfRelay';

  // Compute dataHash from sorted arrays for signing/contract calls
  const dataHash: Hash | undefined =
    txHashesForContract.length > 0 &&
    chainIdsForContract.length > 0 &&
    txHashesForContract.length === chainIdsForContract.length
      ? computeTransactionDataHash(txHashesForContract, chainIdsForContract)
      : undefined;

  // Contract hooks
  const { submitRegistration, hash, isPending, isConfirming, isConfirmed, isError, error, reset } =
    useTransactionRegistration();

  // Get transaction receipt for bridge message ID extraction
  const { data: receipt } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  });

  // Check if this is a cross-chain registration (spoke → hub)
  const isCrossChain = needsTxCrossChainConfirmation(chainId);
  const hubChainId = getHubChainId(chainId);

  // Get registration fee breakdown (chain-aware: hub vs spoke)
  const {
    data: feeBreakdown,
    totalWei: feeWei,
    isLoading: feeLoading,
    isError: feeError,
    refetch: refetchFee,
  } = useTxQuoteFeeBreakdown(address, selectedTxHashes.length);

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
    if (!dataHash) {
      setStoredSignatureState(null);
      return;
    }
    setStoredSignatureState(getTxSignature(dataHash, chainId, TX_SIGNATURE_STEP.REGISTRATION));
  }, [dataHash, chainId]);

  // Expected wallet for this step: forwarder (gas wallet) for self-relay, reporter for standard
  const expectedWallet = storedSignatureState
    ? isSelfRelay
      ? storedSignatureState.forwarder
      : storedSignatureState.reporter
    : undefined;

  // Check if correct wallet is connected
  const isCorrectWallet = Boolean(
    address && expectedWallet && areAddressesEqual(address, expectedWallet)
  );

  // Convert reported chain ID to CAIP-2 format
  const reportedChainIdHash = reportedChainId ? chainIdToBytes32(reportedChainId) : undefined;

  // Use sorted hashes and chain IDs for contract calls
  // These must match the order used to compute the data hash
  const txHashesForContractGuarded =
    txHashesForContract.length > 0 ? txHashesForContract : undefined;
  const chainIdsForContractGuarded =
    chainIdsForContract.length > 0 ? chainIdsForContract : undefined;

  // Parse signature for gas estimation (need the parsed v, r, s values)
  const parsedSigForEstimate = storedSignatureState
    ? parseSignature(storedSignatureState.signature)
    : undefined;

  // Determine if hub or spoke for proper params
  const isHub = isHubChain(chainId);
  const isSpoke = isSpokeChain(chainId);

  // Get gas estimate
  const {
    data: gasEstimate,
    isLoading: gasLoading,
    isError: gasError,
    refetch: refetchGas,
  } = useTxGasEstimate({
    step: 'registration',
    transactionHashes: txHashesForContractGuarded,
    chainIds: chainIdsForContractGuarded,
    reporter: storedSignatureState?.reporter,
    deadline: storedSignatureState?.deadline,
    // Spoke-specific params
    reportedChainId: isSpoke ? reportedChainIdHash : undefined,
    nonce: isSpoke ? storedSignatureState?.nonce : undefined,
    signature: parsedSigForEstimate,
    value: feeWei,
    enabled:
      !!storedSignatureState &&
      !!txHashesForContractGuarded &&
      !!chainIdsForContractGuarded &&
      feeWei !== undefined &&
      isCorrectWallet, // Only estimate gas when correct wallet is connected
  });

  // Cross-chain confirmation - polls hub chain after spoke tx confirms
  // Must pass reporter and reportedChainId to compute the correct batchId
  const crossChainConfirmation = useTxCrossChainConfirmation({
    dataHash,
    reporter: storedSignatureState?.reporter,
    reportedChainId: reportedChainIdHash,
    spokeChainId: chainId,
    enabled:
      isCrossChain &&
      isConfirmed &&
      !!dataHash &&
      !!storedSignatureState?.reporter &&
      !!reportedChainIdHash,
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
      // timeout - show warning state, don't auto-advance
      if (crossChainConfirmation.status === 'timeout') return 'hub-timeout';
    }
    // Local states
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending || isSubmitting) return 'submitting';
    if (isError || localError) return 'failed';
    return 'idle';
  };

  // Build cross-chain progress data for UI
  // Include both 'relaying' and 'hub-timeout' so the explorer link stays visible during timeout
  const currentStatus = getStatus();
  const crossChainProgress: CrossChainProgress | undefined =
    isCrossChain && (currentStatus === 'relaying' || currentStatus === 'hub-timeout')
      ? {
          elapsedTime: crossChainConfirmation.elapsedTime,
          hubChainName: hubChainId ? getChainNameFromExplorer(hubChainId) : undefined,
          bridgeName: feeBreakdown?.bridgeName ?? 'Hyperlane',
          messageId: bridgeMessageId ?? undefined,
          explorerUrl: bridgeMessageId ? getBridgeMessageByIdUrl(bridgeMessageId) : null,
        }
      : undefined;

  // Handle confirmed transaction
  useEffect(() => {
    // For cross-chain: wait for hub confirmation
    if (isCrossChain && isConfirmed && hash) {
      logger.contract.info('Transaction batch registration confirmed on spoke chain', {
        hash,
        dataHash,
        transactionCount: selectedTxHashes.length,
        isCrossChain: true,
      });
      setRegistrationHash(hash, chainId);

      // Wait for hub confirmation before completing
      if (crossChainConfirmation.status === 'confirmed') {
        logger.registration.info('Cross-chain tx batch registration confirmed on hub!', {
          dataHash,
          transactionCount: selectedTxHashes.length,
          transactionHash: hash,
          elapsedTime: crossChainConfirmation.elapsedTime,
        });
        const timerId = window.setTimeout(onComplete, 1500);
        return () => clearTimeout(timerId);
      }

      // Handle timeout - show warning state, don't auto-advance
      // User must click "Continue Anyway" to proceed
      if (crossChainConfirmation.status === 'timeout') {
        logger.registration.warn('Cross-chain tx batch confirmation timed out', {
          dataHash,
          transactionCount: selectedTxHashes.length,
          transactionHash: hash,
          elapsedTime: crossChainConfirmation.elapsedTime,
        });
        // Don't auto-advance - user must click "Continue Anyway"
        return;
      }

      return; // Still waiting for hub confirmation
    }

    // For local (hub chain): complete immediately
    if (!isCrossChain && isConfirmed && hash) {
      logger.contract.info('Transaction batch registration transaction confirmed', {
        hash,
        dataHash,
        transactionCount: selectedTxHashes.length,
      });
      setRegistrationHash(hash, chainId);
      logger.registration.info(
        'Transaction batch registration complete! Transactions successfully registered.',
        {
          dataHash,
          transactionCount: selectedTxHashes.length,
          transactionHash: hash,
        }
      );
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
    dataHash,
    selectedTxHashes.length,
    isCrossChain,
    crossChainConfirmation.status,
  ]);

  /**
   * Submit the registration transaction.
   */
  const handleSubmit = async () => {
    if (isSubmitting || isPending || isConfirming) {
      return;
    }

    logger.contract.info('Transaction batch registration submission initiated', {
      dataHash,
      transactionCount: selectedTxHashes.length,
      hasStoredSignature: !!storedSignatureState,
      registrationType,
      connectedWallet: address,
      expectedWallet,
      isCorrectWallet,
    });

    if (!storedSignatureState || !dataHash || !reportedChainIdHash) {
      logger.contract.error('Cannot submit transaction registration - missing data', {
        hasStoredSignature: !!storedSignatureState,
        dataHash,
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

      // Validate transaction data is available
      if (!txHashesForContractGuarded || !chainIdsForContractGuarded) {
        logger.contract.error('Missing transaction data for registration', {
          hasTxHashes: !!txHashesForContractGuarded,
          hasChainIds: !!chainIdsForContractGuarded,
        });
        setLocalError('Transaction data not ready. Please go back and try again.');
        return;
      }

      logger.contract.info('Submitting transaction batch register to contract', {
        dataHash,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        deadline: storedSignatureState.deadline.toString(),
        chainId,
        feeWei: feeWei.toString(),
      });

      // Build params based on chain type (hub vs spoke have different signatures)
      let params: TxRegistrationParams;

      if (isHub) {
        // Hub: registerTransactions(reporter, deadline, transactionHashes, chainIds, v, r, s) - payable
        const hubParams: TxRegistrationParamsHub = {
          reporter: storedSignatureState.reporter,
          deadline: storedSignatureState.deadline,
          transactionHashes: txHashesForContractGuarded,
          chainIds: chainIdsForContractGuarded,
          signature: parsedSig,
          feeWei,
        };
        params = hubParams;
      } else {
        // Spoke: registerTransactionBatch(reportedChainId, deadline, nonce, reporter, transactionHashes, chainIds, v, r, s)
        const spokeParams: TxRegistrationParamsSpoke = {
          reporter: storedSignatureState.reporter,
          reportedChainId: reportedChainIdHash,
          deadline: storedSignatureState.deadline,
          nonce: storedSignatureState.nonce,
          transactionHashes: txHashesForContractGuarded,
          chainIds: chainIdsForContractGuarded,
          signature: parsedSig,
          feeWei,
        };
        params = spokeParams;
      }

      await submitRegistration(params);

      logger.contract.info(
        'Transaction batch registration transaction submitted, waiting for confirmation'
      );
    } catch (err) {
      logger.contract.error(
        'Transaction batch registration transaction failed',
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
  };

  /**
   * Handle retry after failure.
   */
  const handleRetry = () => {
    reset();
    setLocalError(null);
  };

  /**
   * Handle "Continue Anyway" after cross-chain timeout.
   * User acknowledges the timeout and proceeds to success screen.
   */
  const handleContinueAnyway = () => {
    logger.registration.info('User clicked Continue Anyway after cross-chain timeout', {
      dataHash,
      transactionCount: selectedTxHashes.length,
      transactionHash: hash,
      elapsedTime: crossChainConfirmation.elapsedTime,
    });
    onComplete();
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

      {/* Transaction card with cost breakdown */}
      <TransactionCard
        type="registration"
        status={getStatus()}
        hash={hash}
        error={errorMessage}
        explorerUrl={explorerUrl}
        signedMessage={signedMessageData}
        chainId={chainId}
        crossChainProgress={crossChainProgress}
        costEstimate={
          feeBreakdown
            ? {
                data: {
                  protocolFee: feeBreakdown.registrationFee
                    ? {
                        wei: feeBreakdown.registrationFee.wei,
                        eth: feeBreakdown.registrationFee.eth,
                        usd: feeBreakdown.registrationFee.usd,
                      }
                    : { wei: 0n, eth: '0', usd: '$0.00' },
                  bridgeFee: feeBreakdown.bridgeFee
                    ? {
                        wei: feeBreakdown.bridgeFee.wei,
                        eth: feeBreakdown.bridgeFee.eth,
                        usd: feeBreakdown.bridgeFee.usd,
                      }
                    : null,
                  bridgeName: feeBreakdown.bridgeName,
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
                        wei: feeBreakdown.total.wei + gasEstimate.gasCostWei,
                        eth: formatEthConsistent(feeBreakdown.total.wei + gasEstimate.gasCostWei),
                        usd: ethPrice?.usdCents
                          ? formatCentsToUsd(
                              Math.round(
                                (Number(feeBreakdown.total.wei + gasEstimate.gasCostWei) / 1e18) *
                                  ethPrice.usdCents
                              )
                            )
                          : '—',
                      }
                    : {
                        wei: feeBreakdown.total.wei,
                        eth: feeBreakdown.total.eth,
                        usd: feeBreakdown.total.usd,
                      },
                  ethPriceUsd: ethPrice?.usdFormatted ?? '—',
                  isCrossChain: feeBreakdown.isCrossChain,
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
        onContinueAnyway={handleContinueAnyway}
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
