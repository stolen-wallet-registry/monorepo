/**
 * P2P Acknowledgement Pay Step.
 *
 * - Relayer: Receives signature and submits acknowledgement transaction
 * - Registeree: Waits for relayer to submit transaction
 */

import { useCallback, useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { TransactionCard, type TransactionStatus } from '@/components/composed/TransactionCard';
import { WaitingForData } from '@/components/p2p';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAcknowledgement } from '@/hooks/useAcknowledgement';
import { useFormStore } from '@/stores/formStore';
import { useRegistrationStore } from '@/stores/registrationStore';
import { getSignature, parseSignature, SIGNATURE_STEP } from '@/lib/signatures';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';

export interface P2PAckPayStepProps {
  /** Called when transaction is confirmed */
  onComplete: () => void;
  /** The role in P2P flow */
  role: 'registeree' | 'relayer';
  /** The libp2p node instance */
  libp2p: Libp2p | null;
}

/**
 * P2P step for acknowledgement payment.
 */
export function P2PAckPayStep({ onComplete, role, libp2p }: P2PAckPayStepProps) {
  const chainId = useChainId();
  const { registeree } = useFormStore();
  const { partnerPeerId } = useP2PStore();
  const { acknowledgementHash } = useRegistrationStore();
  const [hasSentHash, setHasSentHash] = useState(false);

  // Get stored signature (relayer only)
  const storedSig =
    role === 'relayer' && registeree
      ? getSignature(registeree, chainId, SIGNATURE_STEP.ACKNOWLEDGEMENT)
      : null;

  // Acknowledgement submission hook (relayer only)
  const {
    submitAcknowledgement,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    reset,
  } = useAcknowledgement();

  // Derive TransactionCard status
  const getStatus = (): TransactionStatus => {
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'pending';
    if (isPending) return 'submitting';
    if (isError) return 'failed';
    return 'idle';
  };

  // Relayer: Submit acknowledgement transaction
  const handleSubmit = useCallback(async () => {
    if (!storedSig || !registeree) {
      return;
    }

    logger.p2p.info('Relayer submitting ACK transaction');

    // Parse signature to v, r, s components
    const parsedSig = parseSignature(storedSig.signature);

    await submitAcknowledgement({
      deadline: storedSig.deadline,
      nonce: storedSig.nonce,
      registeree,
      signature: parsedSig,
    });
  }, [storedSig, registeree, submitAcknowledgement]);

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
          protocols: [PROTOCOLS.ACK_PAY],
          streamData: { hash },
        });

        setHasSentHash(true);
        logger.p2p.info('Sent ACK tx hash to registeree', { hash });
        onComplete();
      } catch (err) {
        logger.p2p.error('Failed to send ACK tx hash', {}, err as Error);
      }
    };

    sendHash();
  }, [role, isConfirmed, hash, libp2p, partnerPeerId, hasSentHash, onComplete]);

  // Registeree: Wait for hash and auto-advance
  useEffect(() => {
    if (role === 'registeree' && acknowledgementHash) {
      logger.p2p.info('Registeree received ACK tx hash, advancing');
      onComplete();
    }
  }, [role, acknowledgementHash, onComplete]);

  // Registeree view - waiting for relayer
  if (role === 'registeree') {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Your relayer is submitting the acknowledgement transaction. Please wait...
          </AlertDescription>
        </Alert>

        {acknowledgementHash ? (
          <TransactionCard
            type="acknowledgement"
            status="confirmed"
            hash={acknowledgementHash}
            onSubmit={() => {}}
          />
        ) : (
          <WaitingForData
            message="Waiting for relayer to submit transaction..."
            waitingFor="acknowledgement transaction hash"
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
          You received the acknowledgement signature. Submit the transaction to register on behalf
          of the stolen wallet owner.
        </AlertDescription>
      </Alert>

      {!storedSig ? (
        <WaitingForData
          message="Waiting for signature from registeree..."
          waitingFor="acknowledgement signature"
        />
      ) : (
        <TransactionCard
          type="acknowledgement"
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
