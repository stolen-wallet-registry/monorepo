/**
 * P2P Relay transaction registration flow page - Reporter role.
 *
 * Reporter selects fraudulent transactions, signs EIP-712 messages,
 * and sends signatures + batch data to relayer via P2P.
 * Relayer pays gas fees on behalf of the reporter.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft, Info } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Stream } from '@libp2p/interface';

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
import { P2PDebugPanel } from '@/components/dev/P2PDebugPanel';
import { WaitForConnectionStep } from '@/components/registration/steps';
import { TxGracePeriodStep, TxSuccessStep } from '@/components/registration/tx-steps';
import { WaitingForData, ConnectionStatusBadge, ReconnectDialog } from '@/components/p2p';
import {
  useTransactionRegistrationStore,
  useTransactionRegistrationFlow,
  getTxNextStep,
  type TransactionRegistrationStep,
} from '@/stores/transactionRegistrationStore';
import { useTransactionSelection, useTransactionFormStore } from '@/stores/transactionFormStore';
import { useP2PStore } from '@/stores/p2pStore';
import {
  useUserTransactions,
  useSignTxEIP712,
  useTransactionAcknowledgementHashStruct,
  useTransactionRegistrationHashStruct,
  useTxContractNonce,
} from '@/hooks/transactions';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  passStreamData,
  getPeerConnection,
  type ProtocolHandler,
} from '@/lib/p2p';
import { computeTransactionDataHash } from '@/lib/signatures/transactions';
import { chainIdToBytes32, toCAIP2, getChainName } from '@swr/chains';
import { DATA_HASH_TOOLTIP } from '@/lib/utils';
import { sanitizeErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { isHash } from '@/lib/types/ethereum';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

// ═══════════════════════════════════════════════════════════════════════════
// Step descriptions / titles
// ═══════════════════════════════════════════════════════════════════════════

const STEP_DESCRIPTIONS: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Connect to your relayer via peer-to-peer',
  'select-transactions': 'Select fraudulent transactions from your wallet',
  'acknowledge-sign': 'Sign the acknowledgement with your wallet',
  'acknowledgement-payment': 'Waiting for relayer to submit acknowledgement',
  'grace-period': 'Wait for the grace period to complete',
  'register-sign': 'Sign the registration with your wallet',
  'registration-payment': 'Waiting for relayer to complete registration',
  success: 'Registration successful',
};

const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Connect to Relayer',
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
              <EnsExplorerLink value={forwarder} type="address" truncate showDisabledIcon={false} />
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
  const { selectedTxHashes, reportedChainId, txHashesForContract, chainIdsForContract } =
    useTransactionSelection();

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
      const sig = await signTxRegistration({
        reporter: address,
        dataHash,
        reportedChainId: reportedChainIdHash,
        transactionCount: selectedTxHashes.length,
        trustedForwarder: forwarder,
        nonce: freshNonce,
        deadline: freshDeadline,
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
    refetchNonce,
    refetchHashStruct,
    signTxRegistration,
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
              <EnsExplorerLink value={forwarder} type="address" truncate showDisabledIcon={false} />
              )
            </>
          )}{' '}
          who will complete the registration.
        </AlertDescription>
      </Alert>

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
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════

export function TransactionP2PReporterPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep } = useTransactionRegistrationFlow();
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
  const {
    partnerPeerId,
    setPeerId,
    setPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();

  // Store libp2p in ref - NEVER pass libp2pRef.current directly as a prop!
  const libp2pRef = useRef<Libp2p | null>(null);
  const [, setNodeReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [protocolError, setProtocolError] = useState<string | null>(null);
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

  // Ref for chainId
  const chainIdRef = useRef(chainId);

  useEffect(() => {
    goToNextStepRef.current = () => {
      const currentStep = useTransactionRegistrationStore.getState().step;
      if (currentStep) {
        const next = getTxNextStep('p2pRelay', currentStep);
        if (next) {
          useTransactionRegistrationStore.getState().setStep(next);
        }
      }
    };
  });

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

  // Set reported chain ID when chain changes
  useEffect(() => {
    if (chainId) {
      setReportedChainId(chainId);
      setSelectedTxHashes([]);
      setSelectedTxDetails([]);
      setTransactionData(null, [], []);
    }
  }, [chainId, setReportedChainId, setSelectedTxHashes, setSelectedTxDetails, setTransactionData]);

  // Initialize P2P node
  useEffect(() => {
    const abortController = new AbortController();
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;
      if (abortController.signal.aborted) return;

      try {
        logger.p2p.info('Initializing P2P node for TX reporter');

        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, _connection?: unknown) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('TX Reporter received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT:
                  // Relayer responded with their address
                  if (data.form?.relayer) {
                    useTransactionFormStore.getState().setForwarder(data.form.relayer as Address);
                  }
                  setConnectedToPeer(true);
                  // Step advancement handled by WaitForConnectionStep.onComplete
                  break;

                case PROTOCOLS.TX_ACK_REC:
                  // Relayer confirmed receipt of ack signature
                  logger.p2p.info('TX ACK signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.TX_ACK_PAY:
                  // Relayer submitted ack tx
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setAcknowledgementHash(data.hash, data.txChainId ?? chainIdRef.current);
                    goToNextStepRef.current();
                  } else {
                    logger.p2p.warn('TX_ACK_PAY received with invalid hash', { hash: data.hash });
                    setProtocolError('Received invalid acknowledgement hash from relayer');
                  }
                  break;

                case PROTOCOLS.TX_REG_REC:
                  // Relayer confirmed receipt of reg signature
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
                    goToNextStepRef.current();
                  } else {
                    logger.p2p.warn('TX_REG_PAY received with invalid hash', { hash: data.hash });
                    setProtocolError('Received invalid registration hash from relayer');
                  }
                  break;
              }
            } catch (err) {
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
        ];

        const { libp2p: p2pNode } = await setup({ handlers, walletAddress: address });

        if (abortController.signal.aborted) {
          await p2pNode.stop();
          return;
        }

        node = p2pNode;
        libp2pRef.current = p2pNode;
        setNodeReady(true);
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
          stopPromise.catch(() => {
            logger.p2p.debug('Error stopping P2P node');
          });
        }
        if (libp2pRef.current === node) {
          libp2pRef.current = null;
          setNodeReady(false);
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
    if (registrationType !== 'p2pRelay') {
      useTransactionRegistrationStore.getState().setRegistrationType('p2pRelay');
    }
  }, [registrationType]);

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

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      setLocation('/');
    }
  }, [isConnected, setLocation]);

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
        stopPromise.catch(() => {
          logger.p2p.debug('Error stopping P2P node on back');
        });
      }
      libp2pRef.current = null;
    }
    setLocation('/registration/transactions/p2p-relay');
  }, [resetTxReg, resetP2P, setLocation]);

  const handleSelectionChange = (hashes: Hash[]) => {
    setSelectedTxHashes(hashes);
    const selectedDetails = transactions
      .filter((tx) => hashes.includes(tx.hash))
      .map((tx) => ({
        hash: tx.hash,
        to: tx.to,
        value: tx.value.toString(),
        blockNumber: tx.blockNumber.toString(),
        timestamp: tx.timestamp,
      }));
    setSelectedTxDetails(selectedDetails);
  };

  const handleContinue = () => {
    if (selectedTxHashes.length > 0) {
      setStep('acknowledge-sign');
    }
  };

  if (!isConnected) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps to register fraudulent transactions via P2P relay.';

  // Compute data hash for display in selection summary
  const displayDataHash =
    selectedTxHashes.length > 0 && chainId
      ? computeTransactionDataHash(
          selectedTxHashes,
          selectedTxHashes.map(() => chainIdToBytes32(chainId))
        )
      : null;

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
                  transactions={transactions
                    .filter((tx) => selectedTxHashes.includes(tx.hash))
                    .map((tx) => ({
                      hash: tx.hash,
                      to: tx.to,
                      value: tx.value.toString(),
                      blockNumber: tx.blockNumber.toString(),
                      timestamp: tx.timestamp,
                    }))}
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
        return (
          <WaitingForData
            message="Waiting for relayer to submit acknowledgement transaction..."
            waitingFor="acknowledgement transaction"
          />
        );

      case 'grace-period':
        return <TxGracePeriodStep onComplete={goToNextStep} />;

      case 'register-sign':
        return <TxP2PRegSign getLibp2p={getLibp2p} />;

      case 'registration-payment':
        return (
          <WaitingForData
            message="Waiting for relayer to complete registration..."
            waitingFor="registration transaction"
          />
        );

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
            <CardContent className="flex-grow flex flex-col justify-center">
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
