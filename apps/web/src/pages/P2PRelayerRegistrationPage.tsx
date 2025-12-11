/**
 * P2P Relay registration flow page - Relayer role.
 *
 * Relayer receives signatures from registeree via P2P and pays gas fees.
 */

import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAccount } from 'wagmi';
import { ArrowLeft } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { IncomingStreamData } from '@libp2p/interface/stream-handler';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StepIndicator } from '@/components/composed/StepIndicator';
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
import { setup, PROTOCOLS, readStreamData, passStreamData, type ProtocolHandler } from '@/lib/p2p';
import { storeSignature, SIGNATURE_STEP, type StoredSignature } from '@/lib/signatures';
import { logger } from '@/lib/logger';

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

  // Initialize P2P node
  useEffect(() => {
    let mounted = true;
    let node: Libp2p | null = null;

    const initP2P = async () => {
      if (!isConnected || !address) return;

      try {
        logger.p2p.info('Initializing P2P node for relayer');

        // Build protocol handlers for relayer
        const streamHandler = (protocol: string) => ({
          handler: async ({ connection, stream }: IncomingStreamData) => {
            try {
              const data = await readStreamData(stream.source);
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

                  goToNextStep();
                  break;

                case PROTOCOLS.ACK_SIG:
                  // Acknowledgement signature received
                  if (data.signature) {
                    const sig = data.signature;
                    const stored: StoredSignature = {
                      signature: sig.value as `0x${string}`,
                      deadline: BigInt(sig.deadline),
                      nonce: BigInt(sig.nonce),
                      address: sig.address,
                      chainId: sig.chainId,
                      step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
                      storedAt: Date.now(),
                    };
                    storeSignature(stored);

                    // Confirm receipt
                    await passStreamData({
                      connection,
                      protocols: [PROTOCOLS.ACK_REC],
                      streamData: { success: true, message: 'Signature received' },
                    });

                    logger.p2p.info('ACK signature stored, advancing to payment');
                    goToNextStep();
                  }
                  break;

                case PROTOCOLS.REG_SIG:
                  // Registration signature received
                  if (data.signature) {
                    const sig = data.signature;
                    const stored: StoredSignature = {
                      signature: sig.value as `0x${string}`,
                      deadline: BigInt(sig.deadline),
                      nonce: BigInt(sig.nonce),
                      address: sig.address,
                      chainId: sig.chainId,
                      step: SIGNATURE_STEP.REGISTRATION,
                      storedAt: Date.now(),
                    };
                    storeSignature(stored);

                    // Confirm receipt
                    await passStreamData({
                      connection,
                      protocols: [PROTOCOLS.REG_REC],
                      streamData: { success: true, message: 'Signature received' },
                    });

                    logger.p2p.info('REG signature stored, advancing to payment');
                    goToNextStep();
                  }
                  break;
              }
            } catch (err) {
              logger.p2p.error('Error handling protocol', { protocol }, err as Error);
            }
          },
          options: { runOnTransientConnection: true },
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
  }, [
    isConnected,
    address,
    setPeerId,
    setFormValues,
    setPartnerPeerId,
    setConnectedToPeer,
    setInitialized,
    goToNextStep,
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
      <Button variant="ghost" onClick={handleBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Home
      </Button>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
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
        <main>
          <Card className="min-h-[400px]">
            <CardHeader>
              <CardTitle>{currentTitle}</CardTitle>
              <CardDescription>{currentDescription}</CardDescription>
            </CardHeader>
            <CardContent>{renderStep()}</CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
