/**
 * P2P Relay registration flow page - Relayer role.
 *
 * Relayer receives signatures from registeree via P2P and pays gas fees.
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
import { StepIndicator } from '@/components/composed/StepIndicator';
import { P2PDebugPanel } from '@/components/dev/P2PDebugPanel';
import {
  WaitForConnectionStep,
  P2PAckPayStep,
  P2PRegPayStep,
  GracePeriodStep,
  SuccessStep,
} from '@/components/registration/steps';
import { WaitingForData, ConnectionStatusBadge, ReconnectDialog } from '@/components/p2p';
import { processSignature } from '@/components/p2p/processRelayedSignature';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore, isPreConnectionStep } from '@/stores/p2pStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { useP2PKeepAlive } from '@/hooks/p2p/useP2PKeepAlive';
import { useP2PConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  acceptStream,
  isRelayerProtocolExpectedAtStep,
  isStreamAbortError,
  type ProtocolHandler,
} from '@/lib/p2p';
import { SIGNATURE_STEP } from '@/lib/signatures';
import { logger } from '@/lib/logger';
import { isAddress } from '@/lib/types/ethereum';

/**
 * Step descriptions for P2P relayer flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': "Paste the registeree's pairing code",
  'acknowledge-and-sign': 'Waiting for registeree to sign acknowledgement',
  'acknowledgement-payment': 'Submit the acknowledgement transaction',
  'grace-period': 'Wait for the grace period to complete',
  'register-and-sign': 'Waiting for registeree to sign registration',
  'registration-payment': 'Submit the registration transaction',
  success: 'Registration successful',
};

/**
 * Step titles for P2P relayer flow.
 */
const STEP_TITLES: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': 'Wait for Connection',
  'acknowledge-and-sign': 'Waiting for Signature',
  'acknowledgement-payment': 'Submit Acknowledgement',
  'grace-period': 'Grace Period',
  'register-and-sign': 'Waiting for Signature',
  'registration-payment': 'Complete Registration',
  success: 'Complete',
};

export function P2PRelayerRegistrationPage() {
  const [, setLocation] = useLocation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { registrationType, step, setRegistrationType } = useRegistrationStore();
  const { setFormValues } = useFormStore();
  const {
    partnerPeerId,
    connectedToPeer,
    pairedWallet,
    setPeerId,
    setPartnerPeerId,
    setConnectedToPeer,
    clearPairedWallet,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  // Entering (or returning to) the pairing step invalidates any earlier pairing. Without this
  // a second attempt would find `connectedToPeer` already true and advance immediately, and a
  // stale `pairedWallet` from an abandoned session would authorize payment for a wallet this
  // relayer never agreed to. Deps are `[step]` only, so the CONNECT that legitimately sets
  // these while still on this step is not undone.
  useEffect(() => {
    if (step === 'wait-for-connection') {
      setConnectedToPeer(false);
      clearPairedWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- must run on step entry only
  }, [step]);

  // Store libp2p in ref - NEVER pass libp2pRef.current directly as a prop!
  // libp2p uses a Proxy that throws when React DevTools tries to serialize it.
  // Always pass getLibp2p getter function instead.
  const libp2pRef = useRef<Libp2p | null>(null);
  // Read inside long-lived protocol handlers, which would otherwise close over a stale chainId
  // if the relayer switches network mid-flow.
  const chainIdRef = useRef(chainId);
  // nodeReady triggers re-render when node initializes so components get the updated ref
  const [, setNodeReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
      setConnectionError(
        'Connection to registeree was lost. They may need to restart the process.'
      );
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

  // Update ref in effect to avoid updating during render (React Compiler rule)
  useEffect(() => {
    goToNextStepRef.current = goToNextStep;
  }, [goToNextStep]);

  useEffect(() => {
    chainIdRef.current = chainId;
  }, [chainId]);

  // Initialize P2P node - only depends on connection state, not step navigation
  // Uses AbortController to handle React Strict Mode double-invocation cleanly
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

      // Check if already aborted (React Strict Mode cleanup)
      if (abortController.signal.aborted) {
        logger.p2p.debug('P2P init aborted before start (Strict Mode cleanup)');
        return;
      }

      try {
        logger.p2p.info('Initializing P2P node for relayer');

        // A fresh flow must never inherit a pin from an abandoned session. `partnerPeerId` is
        // persisted so a mid-flow reload keeps its partner, but a user who closed the tab from
        // the success screen would otherwise start their next flow already pinned to the old
        // partner — and the guard would silently reject the new one. Reading the step from
        // getState() rather than a dependency keeps this out of the effect's deps, which would
        // otherwise tear down and rebuild the libp2p node on every step change.
        if (isPreConnectionStep(useRegistrationStore.getState().step)) {
          useP2PStore.getState().clearPartnerPeerId();
        }

        // Build protocol handlers for relayer
        // Note: Uses ref for goToNextStep to avoid handler recreation
        // In libp2p 3.x, handler signature is (stream, connection) not ({stream, connection})
        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, connection?: Connection) => {
            try {
              const data = await readStreamData(stream);

              // Bind the stream to the agreed partner peer and to this protocol's schema
              // before any of it is trusted. Without this an arbitrary peer that learned a
              // displayed peer ID could inject signatures or drive the step machine.
              if (!acceptStream(protocol, connection, data, 'relayer')) {
                // Rejections used to be logged and nothing else, which made the failure mode
                // indistinguishable from a quiet network: the real registeree's CONNECT is
                // refused because someone else was pinned first, and both sides just sit
                // there. Saying so is what lets a relayer notice they are paired with the
                // wrong peer and restart, rather than eventually paying gas for a stranger.
                if (protocol === PROTOCOLS.CONNECT) {
                  setConnectionError(
                    'A connection attempt was refused because it came from a different peer than the one you are paired with. If your partner cannot connect, restart this page to clear the pairing.'
                  );
                }
                return;
              }

              // Authenticity is not ordering. `acceptStream` proves the message came from the
              // bound partner; this proves it belongs at the step the relayer is actually on.
              // Without it a partner that repeats a CONNECT walks the relayer forward one step
              // per message — into a payment step with no signature stored, or past the
              // grace period it is waiting out.
              const currentStep = useRegistrationStore.getState().step;
              if (!isRelayerProtocolExpectedAtStep(protocol, currentStep)) {
                logger.p2p.warn('Ignored protocol message that does not belong at this step', {
                  protocol,
                  step: currentStep,
                });
                return;
              }

              logger.p2p.info('Relayer received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT: {
                  // The registeree's answer to the CONNECT this page sent after pasting their
                  // pairing code. It proves the pairing was accepted; it is not where the
                  // relayer learns anything.
                  //
                  // SECURITY (audit V4): the wallet being registered comes from the pairing
                  // code and from nowhere else. `data.form.registeree` is the peer's own claim
                  // — writing it into the form store is what made the later "does the
                  // recovered signer match?" check compare a claim against itself. It is now
                  // only ever compared, and a disagreement aborts the pairing rather than
                  // being resolved in the peer's favour.
                  const paired = useP2PStore.getState().pairedWallet;
                  if (!paired) {
                    logger.p2p.error('CONNECT accepted with no paired wallet; refusing');
                    setConnectionError(
                      'This session has no pairing code, so there is no way to tell which wallet you would be paying for. Restart this page and paste the code your partner shows you.'
                    );
                    break;
                  }
                  if (
                    data.form?.registeree &&
                    (!isAddress(data.form.registeree) ||
                      data.form.registeree.toLowerCase() !== paired.toLowerCase())
                  ) {
                    logger.p2p.warn('Peer claims a different wallet than the pairing code names', {
                      claimed: data.form.registeree,
                      paired,
                    });
                    setConnectionError(
                      'Your partner is reporting a different wallet than the one in the pairing code you pasted. Do not continue — ask them for a fresh code.'
                    );
                    break;
                  }
                  setFormValues({ registeree: paired });
                  // The partner peer ID was pinned from the pairing code before dialing.
                  // Deliberately NOT taken from data.p2p.partnerPeerId — a payload-supplied
                  // peer ID is attacker-controlled and would defeat the binding.
                  setConnectedToPeer(true);
                  // No reply and no step advance here: this side dialed, so
                  // WaitForConnectionStep owns the advance and gates it on `connectedToPeer`.
                  break;
                }

                case PROTOCOLS.ACK_SIG:
                  // Acknowledgement signature received
                  await processSignature(
                    data,
                    connection,
                    chainIdRef.current,
                    SIGNATURE_STEP.ACKNOWLEDGEMENT,
                    PROTOCOLS.ACK_REC,
                    address,
                    goToNextStepRef.current
                  );
                  break;

                case PROTOCOLS.REG_SIG:
                  // Registration signature received
                  await processSignature(
                    data,
                    connection,
                    chainIdRef.current,
                    SIGNATURE_STEP.REGISTRATION,
                    PROTOCOLS.REG_REC,
                    address,
                    goToNextStepRef.current
                  );
                  break;
              }
            } catch (err) {
              if (isStreamAbortError(err)) {
                logger.p2p.warn('Stream aborted during read, connection may be degraded', {
                  protocol,
                });
                return;
              }
              logger.p2p.error('Error handling protocol', { protocol }, err as Error);
            }
          },
          // In libp2p 3.x, runOnTransientConnection renamed to runOnLimitedConnection
          options: { runOnLimitedConnection: true },
        });

        const handlers: ProtocolHandler[] = [
          { protocol: PROTOCOLS.CONNECT, streamHandler: streamHandler(PROTOCOLS.CONNECT) },
          { protocol: PROTOCOLS.ACK_SIG, streamHandler: streamHandler(PROTOCOLS.ACK_SIG) },
          { protocol: PROTOCOLS.REG_SIG, streamHandler: streamHandler(PROTOCOLS.REG_SIG) },
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
        setFormValues({ relayer: address });
        setInitialized(true);
        setIsInitializing(false);
        logger.p2p.info('P2P node initialized for relayer', {
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
    setPeerId,
    setFormValues,
    setPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
  ]);

  // Initialize registration type on mount
  useEffect(() => {
    if (registrationType !== 'p2pRelay') {
      setRegistrationType('p2pRelay');
    }
  }, [registrationType, setRegistrationType]);

  // Redirect home only when genuinely disconnected (not while wagmi reconnects on reload)
  const { isReady } = useRequireWallet();

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

  if (!isReady) {
    return null;
  }

  const currentTitle = step ? (STEP_TITLES[step] ?? 'Unknown Step') : 'Getting Started';
  const currentDescription = step
    ? (STEP_DESCRIPTIONS[step] ?? '')
    : 'Help someone register their stolen wallet by paying gas fees.';

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
            role="relayer"
            getLibp2p={getLibp2p}
            onComplete={goToNextStep}
            // Set by the CONNECT handler above when the registeree answers. A resolved write
            // is not an accepted pairing — see the prop's documentation.
            partnerAcknowledged={connectedToPeer}
          />
        );

      case 'acknowledge-and-sign':
        return (
          <WaitingForData
            message="Waiting for registeree to sign acknowledgement..."
            waitingFor="acknowledgement signature"
          />
        );

      case 'acknowledgement-payment':
        return <P2PAckPayStep role="relayer" getLibp2p={getLibp2p} onComplete={goToNextStep} />;

      case 'grace-period':
        return <GracePeriodStep onComplete={goToNextStep} />;

      case 'register-and-sign':
        return (
          <WaitingForData
            message="Waiting for registeree to sign registration..."
            waitingFor="registration signature"
          />
        );

      case 'registration-payment':
        return <P2PRegPayStep role="relayer" getLibp2p={getLibp2p} onComplete={goToNextStep} />;

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
              <CardTitle className="text-lg">P2P Relay (Relayer)</CardTitle>
              <CardDescription>Pay gas for someone else's registration</CardDescription>
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

        {/* Main Content - min height matches sidebar, grows with content */}
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
                'Connection to registeree was lost. They may need to restart the process.'
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
        // The wallet this relayer agreed to pay for. A re-pin is only accepted from a fresh
        // pairing code naming this same wallet — without it, reconnect is a second, unguarded
        // way to change the binding V4 established (see the dialog's module comment).
        pairedWallet={pairedWallet}
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
