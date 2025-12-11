/**
 * P2P Acknowledgement Sign Step.
 *
 * Registeree signs acknowledgement and sends signature to relayer via P2P.
 */

import { useCallback, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSignEIP712 } from '@/hooks/useSignEIP712';
import { useAcknowledgementHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore } from '@/stores/p2pStore';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { logger } from '@/lib/logger';

export interface P2PAckSignStepProps {
  /** The libp2p node instance */
  libp2p: Libp2p | null;
  // Note: onComplete is intentionally not included here.
  // Step advancement is handled by the parent page via protocol handlers
  // when ACK_REC is received from the relayer, ensuring reliable completion.
}

/**
 * P2P step for registeree to sign acknowledgement and send to relayer.
 */
export function P2PAckSignStep({ libp2p }: P2PAckSignStepProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { registeree, relayer } = useFormStore();
  const { partnerPeerId } = useP2PStore();
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);

  // Get hash struct data for signing (deadline)
  const {
    data: hashData,
    isLoading: isLoadingHash,
    error: hashError,
  } = useAcknowledgementHashStruct(relayer || undefined);

  // Get nonce for the registeree
  const {
    nonce,
    isLoading: isLoadingNonce,
    error: nonceError,
  } = useContractNonce(registeree || undefined);

  // Signing hook
  const {
    signAcknowledgement,
    isPending: isSigning,
    isError: isSignError,
    error: signError,
    reset: resetSign,
  } = useSignEIP712();

  // Derive status for SignatureCard
  const getStatus = (): SignatureStatus => {
    if (signature) return 'success';
    if (isSignError || sendError) return 'error';
    if (isSigning || isSending) return 'signing';
    return 'idle';
  };

  // Handle signing and sending
  const handleSign = useCallback(async () => {
    if (
      !hashData ||
      !address ||
      !libp2p ||
      !partnerPeerId ||
      !registeree ||
      !relayer ||
      nonce === undefined
    ) {
      return;
    }

    try {
      setSendError(null);
      resetSign();

      // Sign the acknowledgement
      const sig = await signAcknowledgement({
        owner: registeree,
        forwarder: relayer,
        nonce,
        deadline: hashData.deadline,
      });

      setSignature(sig);

      // Send signature to relayer
      setIsSending(true);

      const connection = await getPeerConnection({ libp2p, remotePeerId: partnerPeerId });

      await passStreamData({
        connection,
        protocols: [PROTOCOLS.ACK_SIG],
        streamData: {
          signature: {
            keyRef: 'AcknowledgementOfRegistry',
            value: sig,
            deadline: hashData.deadline.toString(),
            nonce: nonce.toString(),
            address: registeree,
            chainId,
          },
        },
      });

      logger.p2p.info('ACK signature sent to relayer');
      // Note: onComplete will be called when we receive ACK_REC from relayer
      // The page handles that via protocol handler
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign or send';
      logger.p2p.error('Failed to send ACK signature', {}, err as Error);
      setSendError(message);
    } finally {
      setIsSending(false);
    }
  }, [
    hashData,
    address,
    libp2p,
    partnerPeerId,
    registeree,
    relayer,
    nonce,
    chainId,
    signAcknowledgement,
    resetSign,
  ]);

  const isLoading = isLoadingHash || isLoadingNonce;
  const isReady = !isLoading && hashData && nonce !== undefined && libp2p && partnerPeerId;
  const errorMessage = hashError?.message || nonceError?.message || signError?.message || sendError;

  // Build signature data for display
  const signatureData =
    registeree && relayer && hashData && nonce !== undefined
      ? {
          registeree,
          forwarder: relayer,
          nonce,
          deadline: hashData.deadline,
        }
      : null;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Sign the acknowledgement message with your stolen wallet. The signature will be sent
          securely to your relayer who will submit the transaction on your behalf.
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

      {!isLoading && signatureData && (
        <SignatureCard
          type="acknowledgement"
          data={signatureData}
          status={getStatus()}
          error={errorMessage}
          signature={signature}
          onSign={handleSign}
          onRetry={handleSign}
          disabled={!isReady}
        />
      )}
    </div>
  );
}
