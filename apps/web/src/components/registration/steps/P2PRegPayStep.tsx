/**
 * P2P Registration Pay Step.
 *
 * - Relayer: Receives signature and submits registration transaction
 * - Registeree: Waits for relayer to submit transaction
 */

import { useCallback, useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { TransactionCard, type TransactionStatus } from '@/components/composed/TransactionCard';
import { WaitingForData } from '@/components/p2p';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRegistration } from '@/hooks/useRegistration';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';

export interface P2PRegPayStepProps {
  /** Called when transaction is confirmed */
  onComplete: () => void;
  /** The role in P2P flow */
  role: 'registeree' | 'relayer';
  /** The libp2p node instance */
  libp2p: Libp2p | null;
}

/**
 * P2P step for registration payment.
 */
export function P2PRegPayStep({ onComplete, role, libp2p }: P2PRegPayStepProps) {
  const chainId = useChainId();
  const { registeree } = useFormStore();
  const { partnerPeerId } = useP2PStore();
  const { registrationHash } = useRegistrationStore();
  const [hasSentHash, setHasSentHash] = useState(false);

  // Get stored signature (relayer only)
  const storedSig =
    role === 'relayer' && registeree
      ? getSignature(registeree, chainId, SIGNATURE_STEP.REGISTRATION)
      : null;

  // Registration submission hook (relayer only)
  const { submitRegistration, hash, isPending, isConfirming, isConfirmed, isError, error, reset } =
    useRegistration();

  // Derive TransactionCard status
  const getStatus = (): TransactionStatus => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending) return 'submitting';
    if (isError) return 'failed';
    return 'idle';
  };

  // Relayer: Submit registration transaction
  const handleSubmit = useCallback(async () => {
    if (!storedSig || !registeree) {
      return;
    }

    logger.p2p.info('Relayer submitting REG transaction');

    // Parse signature to v, r, s components
    const parsedSig = parseSignature(storedSig.signature);

    await submitRegistration({
      deadline: storedSig.deadline,
      nonce: storedSig.nonce,
      registeree,
      signature: parsedSig,
    });
  }, [storedSig, registeree, submitRegistration]);

  // Relayer: Send tx hash to registeree after confirmation
  useEffect(() => {
    const sendHash = async () => {
      if (role !== 'relayer' || !isConfirmed || !hash || !libp2p || !partnerPeerId || hasSentHash) {
        return;
      }

      try {
        const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });
        await passStreamData({
          connection,
          protocols: [PROTOCOLS.REG_PAY],
          streamData: { hash },
        });

        setHasSentHash(true);
        logger.p2p.info('Sent REG tx hash to registeree', { hash });
        onComplete();
      } catch (err) {
        logger.p2p.error('Failed to send REG tx hash', {}, err as Error);
      }
    };

    sendHash();
  }, [role, isConfirmed, hash, libp2p, partnerPeerId, hasSentHash, onComplete]);

  // Registeree: Wait for hash and auto-advance
  useEffect(() => {
    if (role === 'registeree' && registrationHash) {
      logger.p2p.info('Registeree received REG tx hash, advancing');
      onComplete();
    }
  }, [role, registrationHash, onComplete]);

  // Registeree view - waiting for relayer
  if (role === 'registeree') {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Your relayer is submitting the registration transaction. Please wait for confirmation...
          </AlertDescription>
        </Alert>

        {registrationHash ? (
          <TransactionCard
            type="registration"
            status="confirmed"
            hash={registrationHash}
            onSubmit={() => {}}
          />
        ) : (
          <WaitingForData
            message="Waiting for relayer to submit transaction..."
            waitingFor="registration transaction hash"
          />
        )}
      </div>
    );
  }

  // Relayer view - submit transaction
  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          You received the registration signature. Submit the final transaction to complete the
          registration.
        </AlertDescription>
      </Alert>

      {!storedSig ? (
        <WaitingForData
          message="Waiting for signature from registeree..."
          waitingFor="registration signature"
        />
      ) : (
        <TransactionCard
          type="registration"
          status={getStatus()}
          hash={hash}
          error={error?.message}
          onSubmit={handleSubmit}
          onRetry={reset}
          disabled={!storedSig}
        />
      )}
    </div>
  );
}
