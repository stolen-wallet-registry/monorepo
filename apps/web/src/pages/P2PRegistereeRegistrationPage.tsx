/**
 * P2P Relay registration flow page - Registeree role.
 *
 * User signs with stolen wallet, sends signatures to relayer via P2P.
 * Relayer pays gas fees on behalf of the registeree.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAccount, useChainId } from 'wagmi';
import { ArrowLeft } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Stream } from '@libp2p/interface';

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
import { StepIndicator } from '@/components/composed/StepIndicator';
import { P2PDebugPanel } from '@/components/dev/P2PDebugPanel';
import {
  WaitForConnectionStep,
  P2PAckSignStep,
  P2PRegSignStep,
  GracePeriodStep,
  SuccessStep,
} from '@/components/registration/steps';
import { WaitingForData, ConnectionStatusBadge, ReconnectDialog } from '@/components/p2p';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore } from '@/stores/p2pStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import { setup, PROTOCOLS, readStreamData, type ProtocolHandler } from '@/lib/p2p';
import { logger } from '@/lib/logger';
import { isHash } from '@/lib/types/ethereum';

/**
 * Step descriptions for P2P registeree flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': 'Connect to your relayer via peer-to-peer',
  'acknowledge-and-sign': 'Sign the acknowledgement with your stolen wallet',
  'acknowledgement-payment': 'Waiting for relayer to submit acknowledgement',
  'grace-period': 'Wait for the grace period to complete',
  'register-and-sign': 'Sign the registration with your stolen wallet',
  'registration-payment': 'Waiting for relayer to complete registration',
  success: 'Registration successful',
};

/**
 * Step titles for P2P registeree flow.
 */
const STEP_TITLES: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': 'Connect to Relayer',
  'acknowledge-and-sign': 'Sign Acknowledgement',
  'acknowledgement-payment': 'Relayer Submitting',
  'grace-period': 'Grace Period',
  'register-and-sign': 'Sign Registration',
  'registration-payment': 'Relayer Completing',
  success: 'Complete',
};

export function P2PRegistereeRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const {
    registrationType,
    step,
    setRegistrationType,
    setAcknowledgementHash,
    setRegistrationHash,
    setBridgeMessageId,
  } = useRegistrationStore();
  const { setFormValues } = useFormStore();
  const {
    partnerPeerId,
    setPeerId,
    setPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Store libp2p in ref - NEVER pass libp2pRef.current directly as a prop!
  // libp2p uses a Proxy that throws when React DevTools tries to serialize it.
  // Always pass getLibp2p getter function instead.
  const libp2pRef = useRef<Libp2p | null>(null);
  // nodeReady triggers re-render when node initializes so components get the updated ref
  const [, setNodeReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);

  // Getter for libp2p - pass this to components, NOT libp2pRef.current
  const getLibp2p = useCallback(() => libp2pRef.current, []);

  // Keep P2P connection alive throughout the session
  // Circuit relay connections timeout after ~2 minutes of inactivity
  useP2PKeepAlive({
    getLibp2p,
    remotePeerId: partnerPeerId,
    onConnectionLost: () => {
      logger.p2p.warn('P2P connection lost');
      setProtocolError('Connection to relayer was lost. Please restart the registration process.');
      setShowReconnectDialog(true);
    },
  });

  // Monitor connection health for both relay and peer
  const { health: connectionHealth } = useP2PConnectionHealth({
    getLibp2p,
    remotePeerId: partnerPeerId,
  });

  // Use ref for goToNextStep to avoid recreating P2P node when step changes
  const goToNextStepRef = useRef(goToNextStep);
  // Use ref for chainId to avoid stale closure in protocol handlers
  const chainIdRef = useRef(chainId);

  // Update refs in effect to avoid updating during render (React Compiler rule)
  useEffect(() => {
    goToNextStepRef.current = goToNextStep;
  }, [goToNextStep]);

  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);

  // Initialize P2P node - only depends on connection state, not step navigation
  // Uses AbortController to handle React Strict Mode double-invocation cleanly
  useEffect(() => {
    const abortController = new AbortController();
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;

      // Check if already aborted (React Strict Mode cleanup)
      if (abortController.signal.aborted) {
        logger.p2p.debug('P2P init aborted before start (Strict Mode cleanup)');
        return;
      }

      try {
        logger.p2p.info('Initializing P2P node for registeree');

        // Build protocol handlers for registeree
        // Note: Uses ref for goToNextStep to avoid handler recreation
        // In libp2p 3.x, handler signature is (stream, connection) - connection unused here
        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, _connection?: unknown) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('Registeree received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT:
                  // Connection established, relayer responded
                  // Only update state here - step advancement is handled by WaitForConnectionStep.onComplete()
                  if (data.form?.relayer) {
                    setFormValues({ relayer: data.form.relayer });
                  }
                  setConnectedToPeer(true);
                  // DO NOT call goToNextStepRef.current() here - causes double step advancement
                  break;

                case PROTOCOLS.ACK_REC:
                  // Signature received confirmation
                  logger.p2p.info('ACK signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.ACK_PAY:
                  // Acknowledgement tx hash received - use relayer's chainId if provided
                  // Use chainIdRef.current to avoid stale closure when network changes
                  // Only advance step when hash validation succeeds
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setAcknowledgementHash(data.hash, data.txChainId ?? chainIdRef.current);
                    goToNextStepRef.current();
                  } else {
                    logger.p2p.warn('ACK_PAY received with invalid or missing hash', {
                      hash: data.hash,
                    });
                    setProtocolError('Received invalid acknowledgement hash from relayer');
                  }
                  break;

                case PROTOCOLS.REG_REC:
                  // Registration signature received confirmation
                  logger.p2p.info('REG signature received by relayer');
                  goToNextStepRef.current();
                  break;

                case PROTOCOLS.REG_PAY:
                  // Registration tx hash (and optional bridge message ID) received
                  // Use relayer's chainId if provided for correct explorer links
                  // Only advance step when hash validation succeeds
                  if (typeof data.hash === 'string' && isHash(data.hash)) {
                    setRegistrationHash(data.hash, data.txChainId ?? chainIdRef.current);
                    // Store bridge message ID if provided (for cross-chain explorer links)
                    if (typeof data.messageId === 'string' && isHash(data.messageId)) {
                      setBridgeMessageId(data.messageId);
                      logger.p2p.info('Received bridge message ID from relayer', {
                        messageId: data.messageId,
                      });
                    }
                    goToNextStepRef.current();
                  } else {
                    logger.p2p.warn('REG_PAY received with invalid or missing hash', {
                      hash: data.hash,
                    });
                    setProtocolError('Received invalid registration hash from relayer');
                  }
                  break;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Protocol handling error';
              logger.p2p.error('Error handling protocol', { protocol }, err as Error);
              setProtocolError(`Error in ${protocol}: ${message}`);
            }
          },
          // In libp2p 3.x, runOnTransientConnection renamed to runOnLimitedConnection
          options: { runOnLimitedConnection: true },
        });

        const handlers: ProtocolHandler[] = [
          { protocol: PROTOCOLS.CONNECT, streamHandler: streamHandler(PROTOCOLS.CONNECT) },
          { protocol: PROTOCOLS.ACK_REC, streamHandler: streamHandler(PROTOCOLS.ACK_REC) },
          { protocol: PROTOCOLS.ACK_PAY, streamHandler: streamHandler(PROTOCOLS.ACK_PAY) },
          { protocol: PROTOCOLS.REG_REC, streamHandler: streamHandler(PROTOCOLS.REG_REC) },
          { protocol: PROTOCOLS.REG_PAY, streamHandler: streamHandler(PROTOCOLS.REG_PAY) },
        ];

        const { libp2p: p2pNode } = await setup({ handlers, walletAddress: address });

        // Check if aborted during setup (React Strict Mode cleanup ran while awaiting)
        if (abortController.signal.aborted) {
          logger.p2p.debug('P2P init aborted after setup, stopping node');
          await p2pNode.stop();
          return;
        }

        node = p2pNode;
        libp2pRef.current = p2pNode;
        setNodeReady(true); // Trigger re-render so components get the node
        setPeerId(p2pNode.peerId.toString());
        setFormValues({ registeree: address });
        setInitialized(true);
        setIsInitializing(false);
        logger.p2p.info('P2P node initialized for registeree', {
          peerId: p2pNode.peerId.toString(),
        });
      } catch (err) {
        // Ignore errors if aborted
        if (abortController.signal.aborted) return;
        logger.p2p.error('Failed to initialize P2P', {}, err as Error);
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
        // Clear ref to prevent stale access
        if (libp2pRef.current === node) {
          libp2pRef.current = null;
          setNodeReady(false);
        }
      }
    };
    // Note: goToNextStep excluded from deps - accessed via ref to prevent node recreation
  }, [
    isConnected,
    address,
    chainId,
    setPeerId,
    setFormValues,
    setConnectedToPeer,
    setInitialized,
    setAcknowledgementHash,
    setRegistrationHash,
    setBridgeMessageId,
  ]);

  // Initialize registration type on mount
  useEffect(() => {
    if (registrationType !== 'p2pRelay') {
      setRegistrationType('p2pRelay');
    }
  }, [registrationType, setRegistrationType]);

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      setLocation('/');
    }
  }, [isConnected, setLocation]);

  const handleBack = useCallback(() => {
    resetFlow();
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
    setLocation('/');
  }, [resetFlow, resetP2P, setLocation]);

  if (!isConnected) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Follow the steps to register your stolen wallet via P2P relay.';

  // Render step content
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

      case 'acknowledge-and-sign':
        return <P2PAckSignStep getLibp2p={getLibp2p} />;

      case 'acknowledgement-payment':
        return (
          <WaitingForData
            message="Waiting for relayer to submit acknowledgement transaction..."
            waitingFor="acknowledgement transaction"
          />
        );

      case 'grace-period':
        return <GracePeriodStep onComplete={goToNextStep} />;

      case 'register-and-sign':
        return <P2PRegSignStep getLibp2p={getLibp2p} />;

      case 'registration-payment':
        return (
          <WaitingForData
            message="Waiting for relayer to complete registration..."
            waitingFor="registration transaction"
          />
        );

      case 'success':
        return <SuccessStep />;

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
        Back to Home
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8 items-start">
        {/* Step Indicator Sidebar */}
        <aside aria-label="Registration steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">P2P Relay Registration</CardTitle>
              <CardDescription>Sign with stolen wallet, relayer pays gas</CardDescription>
            </CardHeader>
            <CardContent>
              <StepIndicator
                registrationType="p2pRelay"
                currentStep={step}
                stepDescriptions={STEP_DESCRIPTIONS}
              />
            </CardContent>
          </Card>
        </aside>

        {/* Main Content - stretches to fill grid row height */}
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

      {/* Reconnect dialog when connection is lost */}
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
