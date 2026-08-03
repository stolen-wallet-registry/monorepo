/**
 * P2P Relay transaction registration flow page - Reporter role.
 *
 * Reporter selects fraudulent transactions, signs EIP-712 messages,
 * and sends signatures + batch data to relayer via P2P.
 * Relayer pays gas fees on behalf of the reporter.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft, Info } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Connection, Stream } from '@libp2p/interface';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@swr/ui';
import { TransactionStepIndicator } from '@/components/composed/TransactionStepIndicator';
import { TransactionSelector } from '@/components/composed/TransactionSelector';
import { InfoTooltip } from '@/components/composed/InfoTooltip';
import { SelectedTransactionsTable } from '@/components/composed/SelectedTransactionsTable';
import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { EnsExplorerLink } from '@/components/composed/EnsExplorerLink';
import { P2PDebugPanel } from '@/components/dev';
import { WaitForConnectionStep } from '@/components/registration/steps';
import { TxGracePeriodStep, TxSuccessStep } from '@/components/registration/tx-steps';
import {
  P2PWaitForAcknowledgement,
  ConnectionStatusBadge,
  ReconnectDialog,
  P2PWaitForConfirmation,
} from '@/components/p2p';
import {
  useTransactionRegistrationStore,
  useTransactionRegistrationFlow,
  getTxNextStep,
  type TransactionRegistrationStep,
} from '@/stores/transactionRegistrationStore';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { useP2PStore, isPreConnectionStep } from '@/stores/p2pStore';
import {
  useUserTransactions,
  useSignTxEIP712,
  useTransactionAcknowledgementHashStruct,
  useTransactionRegistrationHashStruct,
  useTxContractNonce,
  useTxContractDeadlines,
} from '@/hooks/transactions';
import {
  useCrossChainConfirmation,
  needsCrossChainConfirmation,
} from '@/hooks/useCrossChainConfirmation';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import {
  clearSentSignature,
  markSignatureSent,
  receiptMayAdvance,
  resetSentSignatures,
} from '@/hooks/p2p/sentSignatureLatch';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import { useOnValueChange } from '@/hooks/useOnValueChange';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  acceptStream,
  isTxProtocolExpectedAtStep,
  passStreamData,
  sendResignAck,
  getPeerConnection,
  isStreamAbortError,
  type ProtocolHandler,
} from '@/lib/p2p';
import { computeTransactionDataHash } from '@/lib/signatures/transactions';
import { selectStoredTransactionDetails } from '@/lib/transactions/selection';
import { chainIdToBytes32, toCAIP2, getChainName, getBridgeMessageByIdUrl } from '@swr/chains';
import { getHubChainId } from '@/lib/chains/config';
import { DATA_HASH_TOOLTIP } from '@/lib/utils';
import { sanitizeErrorMessage } from '@/lib/utils';
import {
  MAX_RESIGN_REQUESTS,
  parseResignReason,
  resignNoticeForRecipient,
  txResignTargetStep,
} from '@/components/registration/p2pResignRequest';
import { logger } from '@/lib/logger';
import { isAddress, isHash } from '@/lib/types/ethereum';
import type { Hash, Hex } from '@/lib/types/ethereum';

// ═══════════════════════════════════════════════════════════════════════════
// Step descriptions / titles
// ═══════════════════════════════════════════════════════════════════════════

const STEP_DESCRIPTIONS: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Share your pairing code with your relayer',
  'select-transactions': 'Select fraudulent transactions from your wallet',
  'acknowledge-sign': 'Sign the acknowledgement with your wallet',
  'acknowledgement-payment': 'Waiting for relayer to submit acknowledgement',
  'grace-period': 'Wait for the grace period to complete',
  'register-sign': 'Sign the registration with your wallet',
  'registration-payment': 'Waiting for relayer to complete registration',
  success: 'Registration successful',
};

const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Pair with Relayer',
  'select-transactions': 'Select Fraudulent Transactions',
  'acknowledge-sign': 'Sign Acknowledgement',
  'acknowledgement-payment': 'Relayer Submitting',
  'grace-period': 'Grace Period',
  'register-sign': 'Sign Registration',
  'registration-payment': 'Relayer Completing',
  success: 'Complete',
};

// ═══════════════════════════════════════════════════════════════════════════
// P2P TX Ack Sign - Signs acknowledgement and sends to relayer
// ═══════════════════════════════════════════════════════════════════════════

interface TxP2PAckSignProps {
  getLibp2p: () => Libp2p | null;
}

function TxP2PAckSign({ getLibp2p }: TxP2PAckSignProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { partnerPeerId } = useP2PStore();
  const forwarder = useTransactionFormStore((s) => s.forwarder);
  const forwarderFromPeerSession = useTransactionFormStore((s) => s.forwarderFromPeerSession);
  const {
    selectedTxHashes,
    selectedTxDetails,
    reportedChainId,
    txHashesForContract,
    chainIdsForContract,
  } = useTransactionSelection();

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

  // Compute dataHash from sorted arrays
  const reportedChainIdHash = reportedChainId ? chainIdToBytes32(reportedChainId) : undefined;
  const dataHash: Hash | undefined =
    txHashesForContract.length > 0 && chainIdsForContract.length > 0
      ? computeTransactionDataHash(txHashesForContract, chainIdsForContract)
      : undefined;

  // Contract hooks
  const { nonce, isLoading: nonceLoading } = useTxContractNonce(address);
  const {
    data: hashStructData,
    isLoading: hashLoading,
    refetch: refetchHashStruct,
  } = useTransactionAcknowledgementHashStruct(
    dataHash,
    reportedChainIdHash,
    selectedTxHashes.length,
    forwarder ?? undefined
  );

  const {
    signTxAcknowledgement,
    isPending: isSigning,
    isError: isSignError,
    error: signError,
    reset: resetSigning,
  } = useSignTxEIP712();

  const getStatus = (): SignatureStatus => {
    if (signature) return 'success';
    if (isSignError || sendError) return 'error';
    if (isSigning || isSending) return 'signing';
    return 'idle';
  };

  const handleSign = useCallback(async () => {
    const libp2p = getLibp2p();
    if (
      !address ||
      !libp2p ||
      !partnerPeerId ||
      !dataHash ||
      !reportedChainIdHash ||
      !forwarder ||
      nonce === undefined
    ) {
      return;
    }

    if (!forwarderFromPeerSession) {
      logger.p2p.warn(
        'Refusing to sign: forwarder was not established by a handshake this session'
      );
      setSendError(
        'Your relayer connection was not verified in this session. Please reconnect to your relayer before signing.'
      );
      return;
    }

    try {
      setSendError(null);
      resetSigning();

      // Refetch for fresh deadline
      const refetchResult = await refetchHashStruct();
      const freshDeadline = refetchResult.data?.deadline ?? hashStructData?.deadline;
      if (freshDeadline === undefined) {
        setSendError('Failed to load signing data. Please try again.');
        return;
      }

      // Sign
      const sig = await signTxAcknowledgement({
        reporter: address,
        dataHash,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        trustedForwarder: forwarder,
        nonce,
        deadline: freshDeadline,
      });

      setSignature(sig);

      // Send signature + transaction batch to relayer
      setIsSending(true);
      const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });

      await passStreamData({
        connection,
        protocols: [PROTOCOLS.TX_ACK_SIG],
        streamData: {
          signature: {
            keyRef: 'TransactionBatchAcknowledgement',
            value: sig,
            deadline: freshDeadline.toString(),
            nonce: nonce.toString(),
            address,
            chainId,
          },
          transactionBatch: {
            dataHash,
            reportedChainId: reportedChainIdHash,
            transactionCount: selectedTxHashes.length,
            transactionHashes: txHashesForContract,
            chainIdHashes: chainIdsForContract,
          },
        },
      });

      // Record that this side actually produced AND sent the signature. The TX_ACK_REC handler
      // advances the flow only when this is set, so a relayer cannot push the reporter off this
      // step before they have signed anything. Marked here rather than next to `setSignature`
      // above so it means "on the wire", matching the wallet flow's semantics.
      markSignatureSent('tx-ack');
      logger.p2p.info('TX ACK signature + batch sent to relayer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign or send';
      logger.p2p.error('Failed to send TX ACK signature', {}, err as Error);
      setSendError(sanitizeErrorMessage(err) || message);
    } finally {
      setIsSending(false);
    }
  }, [
    address,
    getLibp2p,
    partnerPeerId,
    dataHash,
    reportedChainIdHash,
    forwarder,
    forwarderFromPeerSession,
    nonce,
    hashStructData,
    refetchHashStruct,
    signTxAcknowledgement,
    resetSigning,
    selectedTxHashes.length,
    txHashesForContract,
    chainIdsForContract,
    chainId,
  ]);

  const isLoading = nonceLoading || hashLoading;
  const isReady =
    !isLoading && hashStructData && nonce !== undefined && getLibp2p() && partnerPeerId;
  const errorMessage = signError?.message || sendError;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Sign the acknowledgement to report these transactions as fraudulent. The signature will be
          sent to your relayer{' '}
          {forwarder && (
            <>
              (
              <EnsExplorerLink
                value={forwarder}
                type="address"
                truncate
                resolveEns={false}
                showDisabledIcon={false}
              />
              )
            </>
          )}{' '}
          who will submit the transaction on your behalf.
        </AlertDescription>
      </Alert>

      {/* Batch summary */}
      {dataHash && reportedChainId && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-sm font-medium mb-3">Transaction Batch Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0">Transactions:</span>
              <span className="font-mono font-medium">{selectedTxHashes.length}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0">Chain:</span>
              <span className="font-mono font-medium">
                {getChainName(reportedChainId)}{' '}
                <span className="text-muted-foreground text-xs">({toCAIP2(reportedChainId)})</span>
              </span>
            </div>
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
      )}

      {selectedTxDetails.length > 0 && (
        <SelectedTransactionsTable
          transactions={selectedTxDetails}
          reportedChainId={reportedChainId}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            aria-hidden="true"
          />
          <span className="sr-only">Loading signature data...</span>
        </div>
      )}

      {!isLoading && hashStructData && nonce !== undefined && address && forwarder && (
        <SignatureCard
          type="acknowledgement"
          data={{
            registeree: address,
            trustedForwarder: forwarder,
            nonce,
            deadline: hashStructData.deadline,
            chainId,
          }}
          status={getStatus()}
          error={errorMessage}
          signature={signature}
          onSign={handleSign}
          onRetry={handleSign}
          disabled={!isReady}
          registryType="transaction"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P TX Reg Sign - Signs registration and sends to relayer
// ═══════════════════════════════════════════════════════════════════════════

interface TxP2PRegSignProps {
  getLibp2p: () => Libp2p | null;
}

function TxP2PRegSign({ getLibp2p }: TxP2PRegSignProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { partnerPeerId } = useP2PStore();
  const forwarder = useTransactionFormStore((s) => s.forwarder);
  const forwarderFromPeerSession = useTransactionFormStore((s) => s.forwarderFromPeerSession);
  const {
    selectedTxHashes,
    selectedTxDetails,
    reportedChainId,
    txHashesForContract,
    chainIdsForContract,
  } = useTransactionSelection();

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

  // Use ref for getter to avoid callback re-creation
  const getLibp2pRef = useRef(getLibp2p);
  useEffect(() => {
    getLibp2pRef.current = getLibp2p;
  }, [getLibp2p]);

  const reportedChainIdHash = reportedChainId ? chainIdToBytes32(reportedChainId) : undefined;
  const dataHash: Hash | undefined =
    txHashesForContract.length > 0 && chainIdsForContract.length > 0
      ? computeTransactionDataHash(txHashesForContract, chainIdsForContract)
      : undefined;

  // Contract hooks — reporter address for nonce (post-ack, nonce is incremented)
  const { nonce, isLoading: nonceLoading, refetch: refetchNonce } = useTxContractNonce(address);

  const {
    data: hashStructData,
    isLoading: hashLoading,
    refetch: refetchHashStruct,
  } = useTransactionRegistrationHashStruct(
    dataHash,
    reportedChainIdHash,
    selectedTxHashes.length,
    forwarder ?? undefined
  );

  // The registration signature commits to the hash of a block at or after the acknowledgement's
  // grace-period start; passing the start block lets the signer refuse early.
  const { data: ackDeadlines } = useTxContractDeadlines(address);

  const {
    signTxRegistration,
    isPending: isSigning,
    isError: isSignError,
    error: signError,
    reset: resetSigning,
  } = useSignTxEIP712();

  const getStatus = (): SignatureStatus => {
    if (signature) return 'success';
    if (isSignError || sendError) return 'error';
    if (isSigning || isSending) return 'signing';
    return 'idle';
  };

  const handleSign = useCallback(async () => {
    const libp2p = getLibp2pRef.current();
    if (!address || !libp2p || !partnerPeerId || !dataHash || !reportedChainIdHash || !forwarder) {
      return;
    }

    // Re-checked at the registration phase too, not just at acknowledgement: this is the
    // signature that completes the irreversible registration, and a reload between the two
    // phases restores the forwarder from localStorage without re-running CONNECT.
    if (!forwarderFromPeerSession) {
      logger.p2p.warn(
        'Refusing to sign: forwarder was not established by a handshake this session'
      );
      setSendError(
        'Your relayer connection was not verified in this session. Please reconnect to your relayer before signing.'
      );
      return;
    }

    try {
      setSendError(null);
      resetSigning();

      // Refetch both nonce and deadline — nonce increments after ack
      const [nonceResult, hashResult] = await Promise.all([refetchNonce(), refetchHashStruct()]);
      const freshNonce = nonceResult.status === 'success' ? nonceResult.data : undefined;
      const freshDeadline = hashResult.data?.deadline;

      if (freshNonce === undefined || freshDeadline === undefined) {
        setSendError('Failed to load fresh signing data. Please try again.');
        return;
      }

      // Sign
      const {
        signature: sig,
        windowBlock,
        windowBlockHash,
      } = await signTxRegistration({
        reporter: address,
        dataHash,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        trustedForwarder: forwarder,
        nonce: freshNonce,
        deadline: freshDeadline,
        gracePeriodStart: ackDeadlines?.start,
      });

      setSignature(sig);

      // Send signature + transaction batch to relayer
      setIsSending(true);
      const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });

      await passStreamData({
        connection,
        protocols: [PROTOCOLS.TX_REG_SIG],
        streamData: {
          signature: {
            keyRef: 'TransactionBatchRegistration',
            value: sig,
            deadline: freshDeadline.toString(),
            nonce: freshNonce.toString(),
            address,
            chainId,
            // The relayer cannot re-derive these: it must submit this exact block number and
            // rebuild the digest from this exact hash to verify the signature before paying.
            windowBlock: windowBlock.toString(),
            windowBlockHash,
          },
          transactionBatch: {
            dataHash,
            reportedChainId: reportedChainIdHash,
            transactionCount: selectedTxHashes.length,
            transactionHashes: txHashesForContract,
            chainIdHashes: chainIdsForContract,
          },
        },
      });

      // See the acknowledgement marker above — same rule, phase two.
      markSignatureSent('tx-reg');
      logger.p2p.info('TX REG signature + batch sent to relayer');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign or send';
      logger.p2p.error('Failed to send TX REG signature', {}, err as Error);
      setSendError(sanitizeErrorMessage(err) || message);
    } finally {
      setIsSending(false);
    }
  }, [
    address,
    partnerPeerId,
    dataHash,
    reportedChainIdHash,
    forwarder,
    forwarderFromPeerSession,
    refetchNonce,
    refetchHashStruct,
    signTxRegistration,
    ackDeadlines,
    resetSigning,
    selectedTxHashes.length,
    txHashesForContract,
    chainIdsForContract,
    chainId,
  ]);

  const isLoading = nonceLoading || hashLoading;
  const isReady =
    !isLoading && hashStructData && nonce !== undefined && getLibp2p() && partnerPeerId;
  const errorMessage = signError?.message || sendError;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Sign the registration message to finalize your fraud report. The signature will be sent to
          your relayer{' '}
          {forwarder && (
            <>
              (
              <EnsExplorerLink
                value={forwarder}
                type="address"
                truncate
                resolveEns={false}
                showDisabledIcon={false}
              />
              )
            </>
          )}{' '}
          who will complete the registration.
        </AlertDescription>
      </Alert>

      {/* Batch summary */}
      {dataHash && reportedChainId && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-sm font-medium mb-3">Transaction Batch Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0">Transactions:</span>
              <span className="font-mono font-medium">{selectedTxHashes.length}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0">Chain:</span>
              <span className="font-mono font-medium">
                {getChainName(reportedChainId)}{' '}
                <span className="text-muted-foreground text-xs">({toCAIP2(reportedChainId)})</span>
              </span>
            </div>
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
      )}

      {selectedTxDetails.length > 0 && (
        <SelectedTransactionsTable
          transactions={selectedTxDetails}
          reportedChainId={reportedChainId}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            aria-hidden="true"
          />
          <span className="sr-only">Loading signature data...</span>
        </div>
      )}

      {!isLoading && hashStructData && nonce !== undefined && address && forwarder && (
        <SignatureCard
          type="registration"
          data={{
            registeree: address,
            trustedForwarder: forwarder,
            nonce,
            deadline: hashStructData.deadline,
            chainId,
          }}
          status={getStatus()}
          error={errorMessage}
          signature={signature}
          onSign={handleSign}
          onRetry={handleSign}
          disabled={!isReady}
          registryType="transaction"
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// P2P Wait for Registration - polls hub as fallback when P2P message lost
// ═══════════════════════════════════════════════════════════════════════════

interface TxP2PWaitForRegistrationProps {
  onComplete: () => void;
}

/**
 * Waits for the relayer to complete transaction registration.
 * Polls hub chain via useCrossChainConfirmation; delegates
 * rendering and auto-advance to the shared P2PWaitForConfirmation.
 *
 * On spoke chains, shows CrossChainRelayProgress with Hyperlane tracking.
 */
function TxP2PWaitForRegistration({ onComplete }: TxP2PWaitForRegistrationProps) {
  const chainId = useChainId();
  const { txHashesForContract, reportedChainId } = useTransactionSelection();
  const { bridgeMessageId } = useTransactionRegistrationStore();

  const isCrossChain = needsCrossChainConfirmation(chainId);
  const hubChainId = isCrossChain ? getHubChainId(chainId) : undefined;
  const sampleTxHash = txHashesForContract.length > 0 ? txHashesForContract[0] : undefined;
  const reportedChainIdHash = reportedChainId ? chainIdToBytes32(reportedChainId) : undefined;

  // Track the messageId that was present when this component mounted.
  // Any value on mount is stale (persisted from a previous flow).
  // Only show CrossChainRelayProgress when a NEW messageId arrives.
  const [staleMessageId] = useState(bridgeMessageId);
  const freshMessageId =
    bridgeMessageId && bridgeMessageId !== staleMessageId ? bridgeMessageId : null;

  const confirmation = useCrossChainConfirmation({
    registry: 'transaction',
    sampleTxHash,
    reportedChainId: reportedChainIdHash,
    spokeChainId: chainId,
    enabled: !!sampleTxHash && !!reportedChainIdHash,
    pollInterval: 3000,
    maxPollingTime: 120000,
  });

  return (
    <P2PWaitForConfirmation
      status={confirmation.status}
      elapsedTime={confirmation.elapsedTime}
      onComplete={onComplete}
      waitingFor={
        isCrossChain ? 'cross-chain registration confirmation' : 'registration transaction'
      }
      logContext={{ sampleTxHash, elapsedTime: confirmation.elapsedTime }}
      crossChainProgress={
        isCrossChain && freshMessageId
          ? {
              hubChainName: hubChainId ? getChainName(hubChainId) : undefined,
              bridgeName: 'Hyperlane',
              messageId: freshMessageId,
              explorerUrl: getBridgeMessageByIdUrl(freshMessageId),
            }
          : undefined
      }
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════

export function TransactionP2PReporterPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { step, setStep } = useTransactionRegistrationFlow();
  const {
    setAcknowledgementHash,
    setRegistrationHash,
    setBridgeMessageId,
    reset: resetTxReg,
  } = useTransactionRegistrationStore();
  const {
    selectedTxHashes,
    setSelectedTxHashes,
    setSelectedTxDetails,
    setReportedChainId,
    setTransactionData,
  } = useTransactionSelection();
  const forwarderFromPeerSession = useTransactionFormStore((s) => s.forwarderFromPeerSession);
  const clearForwarderProvenance = useTransactionFormStore((s) => s.clearForwarderProvenance);
  const {
    partnerPeerId,
    setPeerId,
    setPartnerPeerId,
    clearPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();

  // Entering (or returning to) the pairing step invalidates any earlier handshake. Without
  // this, a second connection attempt would find the flag already true and advance on the
  // send instead of on the relayer's reply — the exact gap the reply gate closes.
  useEffect(() => {
    if (step === 'wait-for-connection') {
      clearForwarderProvenance();
      // A second run in this tab must not inherit the first run's "we sent it" latches, or the
      // receipt gate is already open for signatures this run has not produced.
      resetSentSignatures();
    }
  }, [step, clearForwarderProvenance]);

  // Store libp2p in ref - NEVER pass libp2pRef.current directly as a prop!
  const libp2pRef = useRef<Libp2p | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  /**
   * Why this reporter is being asked to sign a second EIP-712 message.
   *
   * Its own channel, deliberately — see the identical note on `P2PRegistereeRegistrationPage`.
   * Sharing the dismissable `protocolError` slot meant a keep-alive failure or any later stream
   * error silently overwrote the one "stop and check with your relayer" warning while the
   * reporter was looking at the signing prompt it was warning them about.
   */
  const [resignNotice, setResignNotice] = useState<{
    step: TransactionRegistrationStep;
    text: string;
  } | null>(null);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);

  // Getter for libp2p
  const getLibp2p = useCallback(() => libp2pRef.current, []);

  // Keep P2P connection alive
  useP2PKeepAlive({
    getLibp2p,
    remotePeerId: partnerPeerId,
    onConnectionLost: () => {
      logger.p2p.warn('P2P connection lost');
      setProtocolError('Connection to relayer was lost. Please restart the registration process.');
      setShowReconnectDialog(true);
    },
  });

  // Monitor connection health
  const { health: connectionHealth } = useP2PConnectionHealth({
    getLibp2p,
    remotePeerId: partnerPeerId,
  });

  // Fetch user transactions
  const {
    transactions,
    isLoading: isLoadingTx,
    isLoadingMore: isLoadingMoreTx,
    error: txError,
    refetch: refetchTx,
    loadMore: loadMoreTx,
    hasMore: hasMoreTx,
    lowestBlockScanned,
  } = useUserTransactions(address);

  // Ref for step advancement to avoid recreating P2P node when step changes
  const goToNextStepRef = useRef(() => {
    const currentStep = useTransactionRegistrationStore.getState().step;
    if (currentStep) {
      const next = getTxNextStep('p2pRelay', currentStep);
      if (next) {
        useTransactionRegistrationStore.getState().setStep(next);
      }
    }
  });

  /**
   * How many re-sign requests this flow has honoured. See the RESIGN_REQ handler below and
   * `MAX_RESIGN_REQUESTS`. A ref so it never becomes a dependency of the P2P node effect.
   */
  const resignRequestCount = useRef(0);

  // Ref for chainId
  const chainIdRef = useRef(chainId);

  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);

  // Compute data hash when selections change
  useEffect(() => {
    if (selectedTxHashes.length > 0 && chainId) {
      const chainIdHash = chainIdToBytes32(chainId);
      const chainIds = selectedTxHashes.map(() => chainIdHash);
      const dataHash = computeTransactionDataHash(selectedTxHashes, chainIds);
      setTransactionData(dataHash, selectedTxHashes, chainIds);
    } else {
      setTransactionData(null, [], []);
    }
  }, [selectedTxHashes, chainId, setTransactionData]);

  // Clear the selection only on a real chain switch. Keying this on [chainId] instead would
  // also fire on mount, wiping the persisted selection every reload while the step index
  // survives — leaving the flow on a later step with no data and no way back. Two hydration
  // artifacts must be filtered out: wagmi reports undefined while reconnecting (the
  // undefined guard), and it can move from the config's default chain to the restored
  // connector's chain — a defined→defined transition that is not a user switch. The
  // persisted selection records which chain it was made for (reportedChainId), so a
  // transition ONTO that chain is a restore, not a switch. This must stay declared ABOVE
  // the recording effect below: on a real switch both fire in declaration order, and
  // recording first would make the comparison always match, skipping every wipe.
  useOnValueChange(chainId, (next, previous) => {
    if (previous === undefined || next === undefined) return;
    if (useTransactionFormStore.getState().reportedChainId === next) return;
    setSelectedTxHashes([]);
    setSelectedTxDetails([]);
    setTransactionData(null, [], []);
  });

  // Record the reported chain ID once the connection is settled. Recording while wagmi is
  // still reconnecting would overwrite the persisted value with the config's default chain
  // and defeat the hydration comparison in the wipe above.
  useEffect(() => {
    if (chainId && isConnected) {
      setReportedChainId(chainId);
    }
  }, [chainId, isConnected, setReportedChainId]);

  // Initialize P2P node
  // Every setState below an await in this effect is already gated on
  // `abortController.signal.aborted` (including inside catch blocks), so a
  // superseded or unmounted run cannot write state. The rule cannot see the
  // guard through the async helper calls.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    const abortController = new AbortController();
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;
      if (abortController.signal.aborted) return;

      try {
        logger.p2p.info('Initializing P2P node for TX reporter');

        // A fresh flow must never inherit a pin from an abandoned session. `partnerPeerId` is
        // persisted so a mid-flow reload keeps its partner, but a user who closed the tab from
        // the success screen would otherwise start their next flow already pinned to the old
        // partner — and the guard would silently reject the new one. Reading the step from
        // getState() rather than a dependency keeps this out of the effect's deps, which would
        // otherwise tear down and rebuild the libp2p node on every step change.
        if (isPreConnectionStep(useTransactionRegistrationStore.getState().step)) {
          useP2PStore.getState().clearPartnerPeerId();
        }

        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, connection?: Connection) => {
            try {
              const data = await readStreamData(stream);

              // Bind the stream to the agreed partner peer and to this protocol's schema
              // before any of it is trusted. Without this an arbitrary peer that learned a
              // displayed peer ID could inject signatures or drive the step machine.
              if (!acceptStream(protocol, connection, data, 'registeree')) return;

              // Authenticity is not ordering. `acceptStream` proves the message came from
              // the bound partner; this proves it makes sense right now. Without it,
              // repeating a payload-free TX_ACK_REC/TX_REG_REC walks the flow one step per
              // message all the way to the success screen.
              const currentStep = useTransactionRegistrationStore.getState().step;
              if (!isTxProtocolExpectedAtStep(protocol, currentStep)) {
                logger.p2p.warn('Ignored protocol message that does not belong at this step', {
                  protocol,
                  step: currentStep,
                });
                return;
              }

              logger.p2p.info('TX Reporter received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT:
                  // Relayer responded with their address.
                  // `isAddress` narrows the wire value rather than asserting it: this is the
                  // boundary where peer-supplied text becomes the `trustedForwarder` the
                  // reporter signs over. `setForwarderFromPeer` also marks it as handshaked in
                  // this session — signing refuses a forwarder that only came back from
                  // localStorage (see TransactionFormState.forwarderFromPeerSession).
                  if (data.form?.relayer && isAddress(data.form.relayer)) {
                    useTransactionFormStore.getState().setForwarderFromPeer(data.form.relayer);
                  } else {
                    logger.p2p.warn('Ignored CONNECT without a usable relayer address', {
                      relayer: data.form?.relayer,
                    });
                    break;
                  }
                  setConnectedToPeer(true);

                  // Answer, so the relayer learns its dial was accepted rather than refused in
                  // silence — it cannot tell the two apart from a resolved write. The reporter
                  // address is echoed so the relayer can compare it against the wallet in the
                  // pairing code it pasted; it is a claim to check, never one to adopt.
                  await passStreamData({
                    connection,
                    protocols: [PROTOCOLS.CONNECT],
                    streamData: {
                      form: { registeree: address },
                      success: true,
                    },
                  });
                  // Step advancement handled by WaitForConnectionStep.onComplete
                  break;

                case PROTOCOLS.TX_ACK_REC:
                  // A receipt is only meaningful as an acknowledgement of something WE sent.
                  // Without this, a relayer that sends TX_ACK_REC early pushes the reporter off
                  // the sign step having signed nothing — and the flow then stalls at a payment
                  // step forever. Ordering (`isTxProtocolExpectedAtStep`) does not cover this:
                  // the receipt IS legitimate at this step, just not before we signed.
                  if (!receiptMayAdvance('tx-ack')) {
                    logger.p2p.warn(
                      'Ignored TX ACK receipt for a signature this session never sent',
                      { step: currentStep }
                    );
                    break;
                  }
                  logger.p2p.info('TX ACK signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.TX_ACK_PAY:
                  // Relayer submitted ack tx
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setAcknowledgementHash(data.hash, data.txChainId ?? chainIdRef.current);
                    // Never advance on the relayer's word — the same rule TX_REG_PAY below
                    // already follows. `data.hash` is shape-checked only: no proof the
                    // transaction exists, targets the registry, or succeeded. Advancing here
                    // drops the reporter into the anti-phishing grace period with nothing on
                    // chain behind it, so they wait out the delay and are then asked for a
                    // registration signature that cannot succeed. The hash is kept for its
                    // explorer link; `P2PWaitForAcknowledgement` advances once the chain shows
                    // a live acknowledgement.
                    logger.registration.info(
                      'Recorded relayer-reported acknowledgement hash; awaiting on-chain confirmation',
                      { chainId: chainIdRef.current }
                    );
                  } else {
                    logger.p2p.warn('TX_ACK_PAY received with invalid hash', { hash: data.hash });
                    setProtocolError('Received invalid acknowledgement hash from relayer');
                  }
                  break;

                case PROTOCOLS.TX_REG_REC:
                  // See TX_ACK_REC above — same rule, phase two.
                  if (!receiptMayAdvance('tx-reg')) {
                    logger.p2p.warn(
                      'Ignored TX REG receipt for a signature this session never sent',
                      { step: currentStep }
                    );
                    break;
                  }
                  logger.p2p.info('TX REG signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.TX_REG_PAY:
                  // Relayer submitted reg tx
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setRegistrationHash(data.hash, data.txChainId ?? chainIdRef.current);
                    if (typeof data.messageId === 'string' && isHash(data.messageId)) {
                      setBridgeMessageId(data.messageId);
                    }
                    // Never advance to success on the relayer's word. `data.hash` is only
                    // checked for shape — there is no proof the transaction exists, targets
                    // the registry, or succeeded — so advancing here would show a reporter a
                    // success screen, with an explorer link, for a batch that may never have
                    // been registered. The hash is recorded for that link and nothing more;
                    // `TxP2PWaitForRegistration` polls `isTransactionRegistered` and advances
                    // only once the chain agrees, on hub and spoke chains alike.
                    logger.registration.info(
                      'Recorded relayer-reported registration hash; awaiting on-chain confirmation',
                      { chainId: chainIdRef.current }
                    );
                  } else {
                    logger.p2p.warn('TX_REG_PAY received with invalid hash', { hash: data.hash });
                    setProtocolError('Received invalid registration hash from relayer');
                  }
                  break;

                case PROTOCOLS.RESIGN_REQ: {
                  // The ONLY inbound message that moves this flow backwards. Bounded exactly
                  // as on the wallet side — see P2PRegistereeRegistrationPage for the full
                  // argument. In short:
                  //   WHO      `acceptStream` already required the pinned partner peer, and
                  //            this is not CONNECT so the pin must pre-exist. It proves the
                  //            sender is the relayer; it does not prove the relayer is honest,
                  //            so everything below treats it as hostile.
                  //   WHEN     `isTxProtocolExpectedAtStep` admits it at the two payment
                  //            steps only.
                  //   WHERE TO `txResignTargetStep` derives one step from our own current
                  //            step plus a validated two-valued enum — never from the wire,
                  //            and never back into `select-transactions`, so the relayer
                  //            cannot make the reporter re-open which transactions get
                  //            reported.
                  //   HOW OFTEN capped by `MAX_RESIGN_REQUESTS` for the life of the flow.
                  // Every exit path below answers, refusals included. Without a reply the
                  // relayer treats a resolved stream write as consent and navigates back to
                  // wait for a signature this side has decided not to send — both sides then
                  // wait forever. See `lib/p2p/resignAck.ts`.
                  const reason = parseResignReason(data.reason);
                  if (!reason) {
                    logger.p2p.warn('Ignored re-sign request with no recognised reason', {
                      step: currentStep,
                    });
                    await sendResignAck({
                      connection,
                      accepted: false,
                      message: 'Re-sign request carried no recognised reason.',
                    });
                    break;
                  }

                  const target = txResignTargetStep(currentStep, reason);
                  if (!target) {
                    logger.p2p.warn('Ignored re-sign request that names no valid recovery step', {
                      step: currentStep,
                      reason,
                    });
                    await sendResignAck({
                      connection,
                      accepted: false,
                      message: 'This flow is not at a step where a re-sign can be honoured.',
                    });
                    break;
                  }

                  if (resignRequestCount.current >= MAX_RESIGN_REQUESTS) {
                    logger.p2p.warn(
                      'Refused re-sign request: this flow has already had its limit',
                      {
                        reason,
                        honoured: resignRequestCount.current,
                        limit: MAX_RESIGN_REQUESTS,
                      }
                    );
                    setProtocolError(
                      `Your relayer has asked you to sign again ${MAX_RESIGN_REQUESTS} times. Further requests are being ignored — stop here and start over with a relayer you trust.`
                    );
                    await sendResignAck({
                      connection,
                      accepted: false,
                      message: 'This flow has already honoured its limit of re-sign requests.',
                    });
                    break;
                  }
                  resignRequestCount.current += 1;

                  // Nothing to erase from storage: the transaction flow never writes a
                  // signature to sessionStorage (`TxP2PAckSign`/`TxP2PRegSign` hold it in
                  // component state and send it straight out). Moving off the payment step
                  // unmounts the sign component, so the dead signature goes with it and the
                  // remounted step starts from a fresh signing prompt.
                  setResignNotice({
                    step: target,
                    text: resignNoticeForRecipient(reason, 'transaction'),
                  });
                  logger.registration.warn('Relayer asked for a new signature; moving back', {
                    from: currentStep,
                    to: target,
                    reason,
                    honoured: resignRequestCount.current,
                  });
                  // A re-sign sends the flow back to a sign step, so the latch for the
                  // signature being replaced has to be dropped — otherwise the receipt gate is
                  // already open for a signature that no longer exists.
                  clearSentSignature('tx-reg');
                  if (target === 'acknowledge-sign') clearSentSignature('tx-ack');

                  // Answered BEFORE the step change, so the relayer is released even if
                  // re-rendering this page tears the handler's context down behind us.
                  await sendResignAck({
                    connection,
                    accepted: true,
                    message: 'Re-sign request accepted.',
                  });

                  useTransactionRegistrationStore.getState().setStep(target);
                  break;
                }
              }
            } catch (err) {
              // Stream abort errors happen when the WebRTC connection degrades
              // (e.g., keep-alive pings failing during cross-chain wait).
              // These are not protocol errors — log and ignore.
              if (isStreamAbortError(err)) {
                logger.p2p.warn('Stream aborted during read, connection may be degraded', {
                  protocol,
                });
                return;
              }
              const message = err instanceof Error ? err.message : 'Protocol handling error';
              logger.p2p.error('Error handling TX protocol', { protocol }, err as Error);
              setProtocolError(`Error in ${protocol}: ${message}`);
            }
          },
          options: { runOnLimitedConnection: true },
        });

        const handlers: ProtocolHandler[] = [
          { protocol: PROTOCOLS.CONNECT, streamHandler: streamHandler(PROTOCOLS.CONNECT) },
          { protocol: PROTOCOLS.TX_ACK_REC, streamHandler: streamHandler(PROTOCOLS.TX_ACK_REC) },
          { protocol: PROTOCOLS.TX_ACK_PAY, streamHandler: streamHandler(PROTOCOLS.TX_ACK_PAY) },
          { protocol: PROTOCOLS.TX_REG_REC, streamHandler: streamHandler(PROTOCOLS.TX_REG_REC) },
          { protocol: PROTOCOLS.TX_REG_PAY, streamHandler: streamHandler(PROTOCOLS.TX_REG_PAY) },
          { protocol: PROTOCOLS.RESIGN_REQ, streamHandler: streamHandler(PROTOCOLS.RESIGN_REQ) },
        ];

        const { libp2p: p2pNode } = await setup({ handlers, walletAddress: address });

        if (abortController.signal.aborted) {
          await p2pNode.stop();
          return;
        }

        node = p2pNode;
        libp2pRef.current = p2pNode;
        setPeerId(p2pNode.peerId.toString());
        useTransactionFormStore.getState().setReporter(address);
        setInitialized(true);
        setIsInitializing(false);
        logger.p2p.info('P2P node initialized for TX reporter', {
          peerId: p2pNode.peerId.toString(),
        });
      } catch (err) {
        if (abortController.signal.aborted) return;
        logger.p2p.error('Failed to initialize P2P for TX reporter', {}, err as Error);
        setIsInitializing(false);
      }
    };

    initP2P();

    return () => {
      abortController.abort();
      if (node) {
        const stopPromise = node.stop();
        if (stopPromise && typeof stopPromise.catch === 'function') {
          stopPromise.catch((err: unknown) => {
            logger.p2p.warn('Failed to stop P2P node on cleanup', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        if (libp2pRef.current === node) {
          libp2pRef.current = null;
        }
      }
    };
    // Note: txFormStore excluded from deps - accessed via getState() to prevent node recreation
  }, [
    isConnected,
    address,
    setPeerId,
    setConnectedToPeer,
    setInitialized,
    setAcknowledgementHash,
    setRegistrationHash,
    setBridgeMessageId,
  ]);

  // Initialize registration type on mount
  useEffect(() => {
    const state = useTransactionRegistrationStore.getState();
    if (state.registrationType !== 'p2pRelay') {
      state.setRegistrationType('p2pRelay');
    }
  }, []);

  // Set initial step
  useEffect(() => {
    if (step === null) {
      setStep('wait-for-connection');
    }
  }, [step, setStep]);

  // Set reporter address when connected
  useEffect(() => {
    if (address) {
      useTransactionFormStore.getState().setReporter(address);
    }
  }, [address]);

  // Redirect home only when genuinely disconnected (not while wagmi reconnects on reload)
  const { isReady } = useRequireWallet();

  // The acknowledgement-payment step advances on this, not on the relayer's TX_ACK_PAY message.
  // Polls on a block-time interval, so it is the chain that moves the flow forward.
  const { data: ackDeadlines } = useTxContractDeadlines(address);

  const goToNextStep = useCallback(() => {
    goToNextStepRef.current();
  }, []);

  const handleBack = useCallback(() => {
    resetTxReg();
    useTransactionFormStore.getState().reset();
    resetP2P();
    if (libp2pRef.current) {
      const stopPromise = libp2pRef.current.stop();
      if (stopPromise && typeof stopPromise.catch === 'function') {
        stopPromise.catch((err: unknown) => {
          logger.p2p.warn('Failed to stop P2P node on back navigation', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      libp2pRef.current = null;
    }
    setLocation('/registration/transactions/p2p-relay');
  }, [resetTxReg, resetP2P, setLocation]);

  // Memoized so the summary table doesn't re-derive (and re-render) on every
  // unrelated render of this page.
  const selectedTransactionRows = useMemo(
    () => selectStoredTransactionDetails(transactions, selectedTxHashes),
    [transactions, selectedTxHashes]
  );

  const handleSelectionChange = useCallback(
    (hashes: Hash[]) => {
      setSelectedTxHashes(hashes);
      setSelectedTxDetails(selectStoredTransactionDetails(transactions, hashes));
    },
    [transactions, setSelectedTxHashes, setSelectedTxDetails]
  );

  const handleContinue = () => {
    if (selectedTxHashes.length > 0) {
      setStep('acknowledge-sign');
    }
  };

  // Compute data hash for display in selection summary
  const displayDataHash = useMemo(
    () =>
      selectedTxHashes.length > 0 && chainId
        ? computeTransactionDataHash(
            selectedTxHashes,
            selectedTxHashes.map(() => chainIdToBytes32(chainId))
          )
        : null,
    [selectedTxHashes, chainId]
  );

  if (!isReady) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps to register fraudulent transactions via P2P relay.';

  const renderStep = () => {
    if (isInitializing) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground">Connecting to P2P network...</p>
        </div>
      );
    }

    switch (step) {
      case 'wait-for-connection':
        return (
          <WaitForConnectionStep
            role="registeree"
            getLibp2p={getLibp2p}
            onComplete={goToNextStep}
            // Only the relayer's CONNECT reply sets this (see the handler above). A resolved
            // write is not proof the pairing was accepted — a refused CONNECT looks identical
            // from the sending side, and advancing on it walks a refused reporter into signing.
            partnerAcknowledged={forwarderFromPeerSession}
          />
        );

      case 'select-transactions':
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Select Fraudulent Transactions</AlertTitle>
              <AlertDescription className="text-sm mt-2">
                <p className="text-muted-foreground">
                  Select transactions where your funds were stolen or transferred without
                  authorization. Your relayer will pay the gas fees to register them.
                </p>
              </AlertDescription>
            </Alert>

            <TransactionSelector
              transactions={transactions}
              selectedHashes={selectedTxHashes}
              onSelectionChange={handleSelectionChange}
              isLoading={isLoadingTx}
              isLoadingMore={isLoadingMoreTx}
              error={txError?.message ?? null}
              onRefresh={refetchTx}
              onLoadMore={loadMoreTx}
              hasMore={hasMoreTx}
              lowestBlockScanned={lowestBlockScanned}
              chainId={chainId}
              maxSelections={100}
            />

            {selectedTxHashes.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-sm font-medium mb-3">Transaction Batch Summary</p>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground shrink-0">Transactions:</span>
                      <span className="font-mono font-medium">{selectedTxHashes.length}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground shrink-0">Reported Chain:</span>
                      <span className="font-mono font-medium">
                        {getChainName(chainId)}{' '}
                        <span className="text-muted-foreground text-xs">({toCAIP2(chainId)})</span>
                      </span>
                    </div>
                    {displayDataHash && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          Data Hash:
                          <InfoTooltip content={DATA_HASH_TOOLTIP} side="right" />
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <code className="font-mono text-xs break-all cursor-default">
                              {displayDataHash}
                            </code>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-md">
                            <p className="text-xs font-mono break-all">{displayDataHash}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>

                <SelectedTransactionsTable
                  transactions={selectedTransactionRows}
                  reportedChainId={chainId}
                />

                <div className="flex justify-end">
                  <Button onClick={handleContinue}>Continue to Sign</Button>
                </div>
              </div>
            )}

            {selectedTxHashes.length === 0 && (
              <div className="flex justify-end">
                <Button disabled>Select transactions to continue</Button>
              </div>
            )}
          </div>
        );

      case 'acknowledge-sign':
        return <TxP2PAckSign getLibp2p={getLibp2p} />;

      case 'acknowledgement-payment':
        // Gated on the chain, not on the relayer's TX_ACK_PAY message — see the handler above.
        return (
          <P2PWaitForAcknowledgement
            deadlines={ackDeadlines}
            onComplete={goToNextStep}
            waitingFor="acknowledgement transaction"
          />
        );

      case 'grace-period':
        return <TxGracePeriodStep onComplete={goToNextStep} />;

      case 'register-sign':
        return <TxP2PRegSign getLibp2p={getLibp2p} />;

      case 'registration-payment':
        return <TxP2PWaitForRegistration onComplete={goToNextStep} />;

      case 'success':
        return <TxSuccessStep />;

      default:
        return (
          <div className="text-muted-foreground text-center py-12">
            Initializing registration flow...
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <Button variant="outline" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Role Selection
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">P2P Relay (Reporter)</CardTitle>
              <CardDescription>Report fraudulent transactions, relayer pays gas</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionStepIndicator
                registrationType="p2pRelay"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content */}
        <main className="flex flex-col gap-4 self-stretch">
          {/* Protocol error alert */}
          {protocolError && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                <span>{protocolError}</span>
                <Button variant="outline" size="sm" onClick={() => setProtocolError(null)}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Card className="flex-grow flex flex-col h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{currentTitle}</CardTitle>
                {!isInitializing && (
                  <ConnectionStatusBadge
                    status={connectionHealth.status}
                    health={connectionHealth}
                  />
                )}
              </div>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-center gap-4">
              {/* Rendered here, not in the page-level alert slot: it explains the signing
                  prompt directly below it, and it has no Dismiss because nothing about it
                  stops being true until the reporter has decided whether to sign. */}
              {resignNotice?.step === step && (
                <Alert variant="destructive">
                  <AlertDescription>{resignNotice.text}</AlertDescription>
                </Alert>
              )}
              {renderStep()}
            </CardContent>
          </Card>

          {/* P2P Debug Panel - development only */}
          <P2PDebugPanel getLibp2p={getLibp2p} walletAddress={address} />
        </main>
      </div>

      {/* Reconnect dialog */}
      <ReconnectDialog
        open={showReconnectDialog}
        onOpenChange={setShowReconnectDialog}
        getLibp2p={getLibp2p}
        currentPeerId={partnerPeerId}
        partnerRole="relayer"
        // This side publishes a pairing code and never holds one for its partner, so there is
        // nothing a typed peer ID could be checked against. Passing no `pairedWallet` withdraws
        // the typed-identity path; clearing the pin is the recovery instead, which re-opens the
        // same trust-on-first-use the original pairing used and extends no new trust.
        onClearPairing={() => {
          clearPartnerPeerId();
          setConnectedToPeer(false);
          setProtocolError(null);
        }}
        onReconnected={(peerId) => {
          setPartnerPeerId(peerId);
          setProtocolError(null);
          setConnectedToPeer(true);
        }}
        onCancel={() => {
          logger.p2p.info('User cancelled reconnection dialog');
        }}
      />
    </div>
  );
}
