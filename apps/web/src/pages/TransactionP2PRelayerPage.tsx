/**
 * P2P Relay transaction registration flow page - Relayer role.
 *
 * Relayer receives signatures + transaction batch data from reporter via P2P
 * and pays gas fees to submit acknowledgement and registration transactions.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Connection, Stream } from '@libp2p/interface';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@swr/ui';
import { TransactionStepIndicator } from '@/components/composed/TransactionStepIndicator';
import { P2PDebugPanel } from '@/components/dev/P2PDebugPanel';
import {
  TxAcknowledgePayStep,
  TxGracePeriodStep,
  TxRegisterPayStep,
  TxSuccessStep,
} from '@/components/registration/tx-steps';
import { WaitForConnectionStep } from '@/components/registration/steps';
import { WaitingForData, ConnectionStatusBadge, ReconnectDialog } from '@/components/p2p';
import {
  useTransactionRegistrationStore,
  useTransactionRegistrationFlow,
  getTxNextStep,
  type TransactionRegistrationStep,
} from '@/stores/transactionRegistrationStore';
import { useTransactionFormStore } from '@/stores/transactionFormStore';
import { useP2PStore } from '@/stores/p2pStore';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  passStreamData,
  type ProtocolHandler,
  type ParsedStreamData,
} from '@/lib/p2p';
import {
  storeTxSignature,
  TX_SIGNATURE_STEP,
  type StoredTxSignature,
} from '@/lib/signatures/transactions';
import { logger } from '@/lib/logger';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

/**
 * Validate and check if signature data has all required fields for transaction registration.
 */
function isValidTxSignatureData(data: ParsedStreamData): boolean {
  return !!(
    data.signature?.value &&
    data.signature?.deadline &&
    data.signature?.nonce &&
    data.signature?.address &&
    data.signature?.chainId !== undefined &&
    data.transactionBatch?.dataHash &&
    data.transactionBatch?.reportedChainId &&
    data.transactionBatch?.transactionCount &&
    data.transactionBatch?.transactionHashes?.length &&
    data.transactionBatch?.chainIdHashes?.length &&
    data.transactionBatch.transactionHashes.length === data.transactionBatch.chainIdHashes.length
  );
}

/**
 * Process a received transaction signature: validate, store in signature storage
 * and form store, confirm receipt, and advance step.
 */
async function processTxSignature(
  data: ParsedStreamData,
  connection: Connection,
  relayerAddress: Address,
  step: typeof TX_SIGNATURE_STEP.ACKNOWLEDGEMENT | typeof TX_SIGNATURE_STEP.REGISTRATION,
  receiptProtocol: string,
  goToNextStep: () => void,
  updateFormStore: (data: ParsedStreamData) => void
): Promise<boolean> {
  if (!isValidTxSignatureData(data)) {
    logger.p2p.warn(
      `Received malformed TX ${step === TX_SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature data`,
      { data }
    );
    return false;
  }

  const sig = data.signature!;
  const batch = data.transactionBatch!;

  // Store signature in sessionStorage
  const stored: StoredTxSignature = {
    signature: sig.value as Hex,
    deadline: BigInt(sig.deadline),
    nonce: BigInt(sig.nonce),
    dataHash: batch.dataHash as Hash,
    reportedChainId: batch.reportedChainId as Hash,
    transactionCount: batch.transactionCount,
    reporter: sig.address as Address,
    trustedForwarder: relayerAddress,
    chainId: sig.chainId,
    step,
    storedAt: Date.now(),
  };
  storeTxSignature(stored);

  // Update form store with transaction batch data
  updateFormStore(data);

  // Confirm receipt
  await passStreamData({
    connection,
    protocols: [receiptProtocol],
    streamData: { success: true, message: 'Transaction signature received' },
  });

  logger.p2p.info(
    `TX ${step === TX_SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature stored, advancing to payment`,
    { reporter: sig.address, transactionCount: batch.transactionCount }
  );
  goToNextStep();
  return true;
}

/**
 * Step descriptions for P2P relayer transaction flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Share your Peer ID with the reporter',
  'select-transactions': 'Waiting for reporter to select transactions',
  'acknowledge-sign': 'Waiting for reporter to sign acknowledgement',
  'acknowledgement-payment': 'Submit the acknowledgement transaction',
  'grace-period': 'Wait for the grace period to complete',
  'register-sign': 'Waiting for reporter to sign registration',
  'registration-payment': 'Submit the registration transaction',
  success: 'Registration successful',
};

/**
 * Step titles for P2P relayer transaction flow.
 */
const STEP_TITLES: Partial<Record<TransactionRegistrationStep, string>> = {
  'wait-for-connection': 'Wait for Connection',
  'select-transactions': 'Waiting for Selection',
  'acknowledge-sign': 'Waiting for Signature',
  'acknowledgement-payment': 'Submit Acknowledgement',
  'grace-period': 'Grace Period',
  'register-sign': 'Waiting for Signature',
  'registration-payment': 'Complete Registration',
  success: 'Complete',
};

export function TransactionP2PRelayerPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setStep } = useTransactionRegistrationFlow();
  const { reset: resetTxReg } = useTransactionRegistrationStore();
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
  const [isInitializing, setIsInitializing] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);

  // Getter for libp2p - pass this to components, NOT libp2pRef.current
  const getLibp2p = useCallback(() => libp2pRef.current, []);

  // Keep P2P connection alive
  useP2PKeepAlive({
    getLibp2p,
    remotePeerId: partnerPeerId,
    onConnectionLost: () => {
      logger.p2p.warn('P2P connection lost');
      setConnectionError('Connection to reporter was lost. They may need to restart the process.');
      setShowReconnectDialog(true);
    },
  });

  // Monitor connection health
  const { health: connectionHealth } = useP2PConnectionHealth({
    getLibp2p,
    remotePeerId: partnerPeerId,
  });

  // Use ref for step advancement to avoid recreating P2P node when step changes
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
   * Update the form store from received P2P data.
   * Uses getState() to avoid unstable deps in the P2P init effect.
   */
  const updateFormStoreFromP2PRef = useRef((data: ParsedStreamData, relayerAddress: Address) => {
    if (!data.signature || !data.transactionBatch) return;

    const sig = data.signature;
    const batch = data.transactionBatch;
    const store = useTransactionFormStore.getState();

    store.setReporter(sig.address as Address);
    store.setForwarder(relayerAddress);
    store.setReportedChainId(sig.chainId);
    store.setSelectedTxHashes(batch.transactionHashes as Hash[]);
    // Populate selectedTxDetails with hash-only entries so payment steps can show the table.
    // The relayer doesn't have full tx details (to, value, block) — only hashes from P2P.
    store.setSelectedTxDetails(
      batch.transactionHashes.map((hash: string) => ({
        hash: hash as Hash,
        to: null,
        value: '0',
        blockNumber: '0',
      }))
    );
    store.setTransactionData(
      batch.dataHash as Hash,
      batch.transactionHashes as Hash[],
      batch.chainIdHashes as Hash[]
    );
  });

  // Initialize P2P node
  useEffect(() => {
    const abortController = new AbortController();
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;

      if (abortController.signal.aborted) {
        logger.p2p.debug('P2P init aborted before start (Strict Mode cleanup)');
        return;
      }

      try {
        logger.p2p.info('Initializing P2P node for TX relayer');

        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('TX Relayer received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT:
                  // Reporter connected
                  if (data.form?.registeree) {
                    useTransactionFormStore.getState().setReporter(data.form.registeree as Address);
                  }
                  if (data.p2p?.partnerPeerId) {
                    setPartnerPeerId(data.p2p.partnerPeerId);
                  }
                  setConnectedToPeer(true);

                  // Respond with relayer address
                  await passStreamData({
                    connection,
                    protocols: [PROTOCOLS.CONNECT],
                    streamData: {
                      form: { relayer: address },
                      success: true,
                    },
                  });

                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.TX_ACK_SIG:
                  // Transaction acknowledgement signature + batch data received
                  // processTxSignature advances one step (select-transactions → acknowledge-sign)
                  // but relayer needs to reach acknowledgement-payment, so advance again
                  await processTxSignature(
                    data,
                    connection,
                    address,
                    TX_SIGNATURE_STEP.ACKNOWLEDGEMENT,
                    PROTOCOLS.TX_ACK_REC,
                    goToNextStepRef.current,
                    (d) => updateFormStoreFromP2PRef.current(d, address)
                  );
                  // Skip acknowledge-sign → acknowledgement-payment
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.TX_REG_SIG:
                  // Transaction registration signature + batch data received
                  await processTxSignature(
                    data,
                    connection,
                    address,
                    TX_SIGNATURE_STEP.REGISTRATION,
                    PROTOCOLS.TX_REG_REC,
                    goToNextStepRef.current,
                    (d) => updateFormStoreFromP2PRef.current(d, address)
                  );
                  break;
              }
            } catch (err) {
              logger.p2p.error('Error handling TX protocol', { protocol }, err as Error);
            }
          },
          options: { runOnLimitedConnection: true },
        });

        const handlers: ProtocolHandler[] = [
          { protocol: PROTOCOLS.CONNECT, streamHandler: streamHandler(PROTOCOLS.CONNECT) },
          { protocol: PROTOCOLS.TX_ACK_SIG, streamHandler: streamHandler(PROTOCOLS.TX_ACK_SIG) },
          { protocol: PROTOCOLS.TX_REG_SIG, streamHandler: streamHandler(PROTOCOLS.TX_REG_SIG) },
        ];

        const { libp2p: p2pNode } = await setup({ handlers, walletAddress: address });

        if (abortController.signal.aborted) {
          logger.p2p.debug('P2P init aborted after setup, stopping node');
          await p2pNode.stop();
          return;
        }

        node = p2pNode;
        libp2pRef.current = p2pNode;
        setPeerId(p2pNode.peerId.toString());
        setInitialized(true);
        setIsInitializing(false);
        logger.p2p.info('P2P node initialized for TX relayer', {
          peerId: p2pNode.peerId.toString(),
        });
      } catch (err) {
        if (abortController.signal.aborted) return;
        logger.p2p.error('Failed to initialize P2P for TX relayer', {}, err as Error);
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
        }
      }
    };
    // Note: txFormStore excluded from deps - accessed via getState() to prevent node recreation
  }, [isConnected, address, setPeerId, setPartnerPeerId, setConnectedToPeer, setInitialized]);

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

  const handleAckComplete = useCallback(() => {
    // After ack submission, notify reporter via P2P
    const node = libp2pRef.current;
    const ackHash = useTransactionRegistrationStore.getState().acknowledgementHash;
    const ackChainId = useTransactionRegistrationStore.getState().acknowledgementChainId;
    if (node && partnerPeerId && ackHash) {
      const connections = node.getConnections();
      const conn = connections.find((c) => c.remotePeer.toString() === partnerPeerId);
      if (conn) {
        passStreamData({
          connection: conn,
          protocols: [PROTOCOLS.TX_ACK_PAY],
          streamData: {
            hash: ackHash,
            txChainId: ackChainId ?? chainId,
            success: true,
          },
        }).catch((err) => {
          logger.p2p.error('Failed to send TX ACK_PAY', {}, err as Error);
        });
      }
    }
    goToNextStep();
  }, [partnerPeerId, chainId, goToNextStep]);

  const handleRegComplete = useCallback(() => {
    // After reg submission, notify reporter via P2P
    const node = libp2pRef.current;
    const regHash = useTransactionRegistrationStore.getState().registrationHash;
    const regChainId = useTransactionRegistrationStore.getState().registrationChainId;
    const msgId = useTransactionRegistrationStore.getState().bridgeMessageId;
    if (node && partnerPeerId && regHash) {
      const connections = node.getConnections();
      const conn = connections.find((c) => c.remotePeer.toString() === partnerPeerId);
      if (conn) {
        const streamData: ParsedStreamData = {
          hash: regHash,
          txChainId: regChainId ?? chainId,
          success: true,
        };
        if (msgId) {
          streamData.messageId = msgId;
        }
        passStreamData({
          connection: conn,
          protocols: [PROTOCOLS.TX_REG_PAY],
          streamData,
        }).catch((err) => {
          logger.p2p.error('Failed to send TX REG_PAY', {}, err as Error);
        });
      }
    }
    goToNextStep();
  }, [partnerPeerId, chainId, goToNextStep]);

  if (!isConnected) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Help someone register fraudulent transactions by paying gas fees.';

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
          <WaitForConnectionStep role="relayer" getLibp2p={getLibp2p} onComplete={goToNextStep} />
        );

      case 'select-transactions':
        return (
          <WaitingForData
            message="Waiting for reporter to select transactions..."
            waitingFor="transaction selection"
          />
        );

      case 'acknowledge-sign':
        return (
          <WaitingForData
            message="Waiting for reporter to sign acknowledgement..."
            waitingFor="acknowledgement signature"
          />
        );

      case 'acknowledgement-payment':
        return <TxAcknowledgePayStep onComplete={handleAckComplete} />;

      case 'grace-period':
        return <TxGracePeriodStep onComplete={goToNextStep} />;

      case 'register-sign':
        return (
          <WaitingForData
            message="Waiting for reporter to sign registration..."
            waitingFor="registration signature"
          />
        );

      case 'registration-payment':
        return <TxRegisterPayStep onComplete={handleRegComplete} />;

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
              <CardTitle className="text-lg">P2P Relay (Relayer)</CardTitle>
              <CardDescription>
                Pay gas for someone else&apos;s transaction registration
              </CardDescription>
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
          {/* Connection error alert */}
          {connectionError && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                <span>{connectionError}</span>
                <Button variant="outline" size="sm" onClick={() => setConnectionError(null)}>
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
          <P2PDebugPanel
            getLibp2p={getLibp2p}
            walletAddress={address}
            onSimulateConnectionLost={() => {
              setConnectionError(
                'Connection to reporter was lost. They may need to restart the process.'
              );
              setShowReconnectDialog(true);
            }}
          />
        </main>
      </div>

      {/* Reconnect dialog when connection is lost */}
      <ReconnectDialog
        open={showReconnectDialog}
        onOpenChange={setShowReconnectDialog}
        getLibp2p={getLibp2p}
        currentPeerId={partnerPeerId}
        partnerRole="registeree"
        onReconnected={(peerId) => {
          setPartnerPeerId(peerId);
          setConnectionError(null);
          setConnectedToPeer(true);
        }}
        onCancel={() => {
          logger.p2p.info('User cancelled reconnection dialog');
        }}
      />
    </div>
  );
}
