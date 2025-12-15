/**
 * Wait for P2P connection step.
 *
 * - Registeree: Shows form to connect to relayer by peer ID
 * - Relayer: Shows peer ID for registeree to connect to
 */

import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';

import { Alert, AlertDescription } from '@swr/ui';
import { PeerIdDisplay, PeerConnectForm } from '@/components/p2p';
import { useP2PStore } from '@/stores/p2pStore';
import { PROTOCOLS, passStreamData, getPeerConnection } from '@/lib/p2p';
import type { Libp2p } from 'libp2p';
import { logger } from '@/lib/logger';

export interface WaitForConnectionStepProps {
  /** Called when connection is established */
  onComplete: () => void;
  /** The role in P2P flow */
  role: 'registeree' | 'relayer';
  /** The libp2p node instance */
  libp2p: Libp2p | null;
}

/**
 * Step for establishing P2P connection between registeree and relayer.
 */
export function WaitForConnectionStep({ onComplete, role, libp2p }: WaitForConnectionStepProps) {
  const { address } = useAccount();
  const { peerId, isInitialized, setPartnerPeerId, setConnectedToPeer } = useP2PStore();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Registeree connects to relayer
  const handleConnect = useCallback(
    async (remotePeerId: string) => {
      if (!libp2p) {
        setConnectionError('P2P node not initialized');
        return;
      }

      setIsConnecting(true);
      setConnectionError(null);

      try {
        logger.p2p.info('Connecting to relayer', { remotePeerId });

        // Get connection to remote peer
        const connection = await getPeerConnection({ libp2p, remotePeerId });

        // Send connect handshake with registeree address
        await passStreamData({
          connection,
          protocols: [PROTOCOLS.CONNECT],
          streamData: {
            form: { registeree: address },
            p2p: { partnerPeerId: peerId || undefined },
          },
        });

        setPartnerPeerId(remotePeerId);
        setConnectedToPeer(true);

        logger.p2p.info('Connected to relayer successfully');
        onComplete();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        logger.p2p.error('Connection to relayer failed', {}, err as Error);
        setConnectionError(message);
      } finally {
        setIsConnecting(false);
      }
    },
    [libp2p, address, peerId, setPartnerPeerId, setConnectedToPeer, onComplete]
  );

  if (!isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-muted-foreground">Connecting to relay server...</p>
      </div>
    );
  }

  if (role === 'relayer') {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Share your Peer ID with the person registering their stolen wallet. They will use it to
            connect to you.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col items-center space-y-4">
          <p className="text-sm text-muted-foreground">Your Peer ID (click to copy):</p>
          <PeerIdDisplay peerId={peerId} />
          <p className="text-xs text-muted-foreground">Waiting for connection from registeree...</p>
        </div>
      </div>
    );
  }

  // Registeree view
  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Enter the Peer ID shared by your relayer to establish a secure P2P connection. They will
          pay the gas fees on your behalf.
        </AlertDescription>
      </Alert>

      <PeerConnectForm
        onConnect={handleConnect}
        isConnecting={isConnecting}
        error={connectionError}
      />
    </div>
  );
}
