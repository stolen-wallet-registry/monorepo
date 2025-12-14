/**
 * P2P Registration Sign Step.
 *
 * Registeree signs registration and sends signature to relayer via P2P.
 */

import { useCallback, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { Libp2p } from 'libp2p';

import { SignatureCard, type SignatureStatus } from '@/components/composed/SignatureCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSignEIP712 } from '@/hooks/useSignEIP712';
import { useRegistrationHashStruct } from '@/hooks/useGenerateHashStruct';
import { useContractNonce } from '@/hooks/useContractNonce';
import { useFormStore } from '@/stores/formStore';
import { useP2PStore } from '@/stores/p2pStore';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import { logger } from '@/lib/logger';

export interface P2PRegSignStepProps {
  /** The libp2p node instance */
  libp2p: Libp2p | null;
  // Note: onComplete is intentionally not included here.
  // Step advancement is handled by the parent page via protocol handlers
  // when REG_REC is received from the relayer, ensuring reliable completion.
}

/**
 * P2P step for registeree to sign registration and send to relayer.
 */
export function P2PRegSignStep({ libp2p }: P2PRegSignStepProps) {
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
  } = useRegistrationHashStruct(relayer || undefined);

  // Get nonce for the registeree
  const {
    nonce,
    isLoading: isLoadingNonce,
    error: nonceError,
  } = useContractNonce(registeree || undefined);

  // Signing hook
  const {
    signRegistration,
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

      // Sign the registration
      const sig = await signRegistration({
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
        protocols: [PROTOCOLS.REG_SIG],
        streamData: {
          signature: {
            keyRef: 'Registration',
            value: sig,
            deadline: hashData.deadline.toString(),
            nonce: nonce.toString(),
            address: registeree,
            chainId,
          },
        },
      });

      logger.p2p.info('REG signature sent to relayer');
      // Note: onComplete will be called when we receive REG_REC from relayer
      // The page handles that via protocol handler
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign or send';
      logger.p2p.error('Failed to send REG signature', {}, err as Error);
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
    signRegistration,
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
          chainId,
        }
      : null;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Sign the registration message with your stolen wallet. The signature will be sent securely
          to your relayer who will complete the registration.
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
          type="registration"
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
