/**
 * P2P Relay registration flow page - Relayer role.
 *
 * Relayer receives signatures from registeree via P2P and pays gas fees.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Connection, Stream } from '@libp2p/interface';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepIndicator } from '@/components/composed/StepIndicator';
import { P2PDebugPanel } from '@/components/dev/P2PDebugPanel';
import {
  WaitForConnectionStep,
  P2PAckPayStep,
  P2PRegPayStep,
  GracePeriodStep,
  SuccessStep,
} from '@/components/registration/steps';
import { WaitingForData } from '@/components/p2p';
import { useRegistrationStore, type RegistrationStep } from '@/stores/registrationStore';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore } from '@/stores/p2pStore';
import { useStepNavigation } from '@/hooks/useStepNavigation';
import {
  setup,
  PROTOCOLS,
  readStreamData,
  passStreamData,
  type ProtocolHandler,
  type ParsedStreamData,
} from '@/lib/p2p';
import { storeSignature, SIGNATURE_STEP, type StoredSignature } from '@/lib/signatures';
import { logger } from '@/lib/logger';

/**
 * Validate and check if signature data has all required fields.
 */
function isValidSignatureData(data: ParsedStreamData): data is ParsedStreamData & {
  signature: NonNullable<ParsedStreamData['signature']>;
} {
  return !!(
    data.signature?.value &&
    data.signature?.deadline &&
    data.signature?.nonce &&
    data.signature?.address &&
    data.signature?.chainId !== undefined
  );
}

/**
 * Process a received signature: validate, store, confirm receipt, and advance step.
 */
async function processSignature(
  data: ParsedStreamData,
  connection: Connection,
  step: typeof SIGNATURE_STEP.ACKNOWLEDGEMENT | typeof SIGNATURE_STEP.REGISTRATION,
  receiptProtocol: string,
  goToNextStep: () => void
): Promise<boolean> {
  if (!isValidSignatureData(data)) {
    logger.p2p.warn(
      `Received malformed ${step === SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature data`,
      { data }
    );
    return false;
  }

  const sig = data.signature;
  const stored: StoredSignature = {
    signature: sig.value as `0x${string}`,
    deadline: BigInt(sig.deadline),
    nonce: BigInt(sig.nonce),
    address: sig.address,
    chainId: sig.chainId,
    step,
    storedAt: Date.now(),
  };
  storeSignature(stored);

  // Confirm receipt
  await passStreamData({
    connection,
    protocols: [receiptProtocol],
    streamData: { success: true, message: 'Signature received' },
  });

  logger.p2p.info(
    `${step === SIGNATURE_STEP.ACKNOWLEDGEMENT ? 'ACK' : 'REG'} signature stored, advancing to payment`
  );
  goToNextStep();
  return true;
}

/**
 * Step descriptions for P2P relayer flow.
 */
const STEP_DESCRIPTIONS: Partial<Record<RegistrationStep, string>> = {
  'wait-for-connection': 'Share your Peer ID with the registeree',
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
  const { registrationType, step, setRegistrationType } = useRegistrationStore();
  const { setFormValues } = useFormStore();
  const {
    setPeerId,
    setPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
    reset: resetP2P,
  } = useP2PStore();
  const { goToNextStep, resetFlow } = useStepNavigation();

  const [libp2p, setLibp2p] = useState<Libp2p | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Use ref for goToNextStep to avoid recreating P2P node when step changes
  const goToNextStepRef = useRef(goToNextStep);

  // Update ref in effect to avoid updating during render (React Compiler rule)
  useEffect(() => {
    goToNextStepRef.current = goToNextStep;
  }, [goToNextStep]);

  // Initialize P2P node - only depends on connection state, not step navigation
  useEffect(() => {
    let mounted = true;
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;

      try {
        logger.p2p.info('Initializing P2P node for relayer');

        // Build protocol handlers for relayer
        // Note: Uses ref for goToNextStep to avoid handler recreation
        // In libp2p 3.x, handler signature is (stream, connection) not ({stream, connection})
        const streamHandler = (protocol: string) => ({
          handler: async (stream: Stream, connection: Connection) => {
            try {
              const data = await readStreamData(stream);
              logger.p2p.info('Relayer received data', { protocol, data });

              switch (protocol) {
                case PROTOCOLS.CONNECT:
                  // Registeree connected
                  if (data.form?.registeree) {
                    setFormValues({ registeree: data.form.registeree });
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

                case PROTOCOLS.ACK_SIG:
                  // Acknowledgement signature received
                  await processSignature(
                    data,
                    connection,
                    SIGNATURE_STEP.ACKNOWLEDGEMENT,
                    PROTOCOLS.ACK_REC,
                    goToNextStepRef.current
                  );
                  break;

                case PROTOCOLS.REG_SIG:
                  // Registration signature received
                  await processSignature(
                    data,
                    connection,
                    SIGNATURE_STEP.REGISTRATION,
                    PROTOCOLS.REG_REC,
                    goToNextStepRef.current
                  );
                  break;
              }
            } catch (err) {
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

        const { libp2p: p2pNode } = await setup(handlers);
        node = p2pNode;

        if (mounted) {
          setLibp2p(p2pNode);
          setPeerId(p2pNode.peerId.toString());
          setFormValues({ relayer: address });
          setInitialized(true);
          setIsInitializing(false);
          logger.p2p.info('P2P node initialized for relayer', {
            peerId: p2pNode.peerId.toString(),
          });
        }
      } catch (err) {
        logger.p2p.error('Failed to initialize P2P', {}, err as Error);
        if (mounted) {
          setIsInitializing(false);
        }
      }
    };

    initP2P();

    return () => {
      mounted = false;
      if (node) {
        const stopPromise = node.stop();
        if (stopPromise && typeof stopPromise.catch === 'function') {
          stopPromise.catch(() => {
            logger.p2p.debug('Error stopping P2P node');
          });
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

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) {
      setLocation('/');
    }
  }, [isConnected, setLocation]);

  const handleBack = useCallback(() => {
    resetFlow();
    resetP2P();
    if (libp2p) {
      const stopPromise = libp2p.stop();
      if (stopPromise && typeof stopPromise.catch === 'function') {
        stopPromise.catch(() => {
          logger.p2p.debug('Error stopping P2P node on back');
        });
      }
    }
    setLocation('/');
  }, [resetFlow, resetP2P, libp2p, setLocation]);

  // Getter for P2P debug panel - must be before early return
  const getLibp2p = useMemo(() => () => libp2p, [libp2p]);

  if (!isConnected) {
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
        return <WaitForConnectionStep role="relayer" libp2p={libp2p} onComplete={goToNextStep} />;

      case 'acknowledge-and-sign':
        return (
          <WaitingForData
            message="Waiting for registeree to sign acknowledgement..."
            waitingFor="acknowledgement signature"
          />
        );

      case 'acknowledgement-payment':
        return <P2PAckPayStep role="relayer" libp2p={libp2p} onComplete={goToNextStep} />;

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
        return <P2PRegPayStep role="relayer" libp2p={libp2p} onComplete={goToNextStep} />;

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
        <aside>
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

        {/* Main Content */}
        <main className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{currentTitle}</CardTitle>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent>{renderStep()}</CardContent>
          </Card>

          {/* P2P Debug Panel - development only */}
          <P2PDebugPanel getLibp2p={getLibp2p} />
        </main>
      </div>
    </div>
  );
}
