/**
 * Destructive/dev-only controls for the P2P debug panel: dropping connections,
 * simulating a lost connection, inspecting the outgoing message queue and clearing
 * the persisted peer ID.
 *
 * Everything here acts on the live libp2p node, so it takes the same getter the panel
 * does (libp2p is a Proxy that throws on unknown property access, so it must never be
 * passed as a plain prop) plus a getter for the relay peer IDs, which are resolved
 * lazily on the client.
 */

import type { Libp2p } from 'libp2p';
import { AlertTriangle, Key, Trash2, Unplug, WifiOff } from 'lucide-react';

import { Button } from '@swr/ui';
import { cn } from '@/lib/utils';
import { clearStoredPeerId } from '@/lib/p2p/peerId';
import { clearMessageQueue, type QueuedMessage } from '@/lib/p2p/messageQueue';
import { logger } from '@/lib/logger';

interface P2PDebugControlsProps {
  /** Getter for the libp2p node - never pass the node itself as a prop */
  getLibp2p: () => Libp2p | null;
  /** Getter for the known relay peer IDs (resolved lazily on the client) */
  getRelayPeerIds: () => Set<string>;
  /** Re-read the node and refresh the panel snapshot */
  onRefresh: () => void;
  /** Reset the store's connected flag for immediate UI feedback */
  setConnectedToPeer: (connected: boolean) => void;
  /** Messages still queued for delivery */
  pendingMessages: QueuedMessage[];
  /** Connected wallet address - enables peer ID storage controls */
  walletAddress?: string;
  /** Whether a peer ID is currently persisted for this wallet */
  hasPeerId: boolean;
  /** Callback to trigger connection lost state (for testing) */
  onSimulateConnectionLost?: () => void;
}

export function P2PDebugControls({
  getLibp2p,
  getRelayPeerIds,
  onRefresh,
  setConnectedToPeer,
  pendingMessages,
  walletAddress,
  hasPeerId,
  onSimulateConnectionLost,
}: P2PDebugControlsProps) {
  return (
    <div className="space-y-3">
      {/* Connection Controls */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Connection Controls</h4>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const libp2p = getLibp2p();
              if (!libp2p) return;
              // Close all connections to relay servers
              const relayIds = getRelayPeerIds();
              libp2p.getConnections().forEach((conn) => {
                if (relayIds.has(conn.remotePeer.toString())) {
                  conn.close().catch((err) => {
                    logger.p2p.debug('[DevTools] Error closing relay connection', {
                      peer: conn.remotePeer.toString(),
                      error: err instanceof Error ? err.message : 'Unknown error',
                    });
                  });
                  logger.p2p.info('[DevTools] Closed relay connection', {
                    peer: conn.remotePeer.toString(),
                  });
                }
              });
              setTimeout(onRefresh, 100);
            }}
          >
            <Unplug className="h-3 w-3 mr-1" />
            Drop Relay
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const libp2p = getLibp2p();
              if (!libp2p) return;
              // Close all non-relay connections
              const relayIds = getRelayPeerIds();
              libp2p.getConnections().forEach((conn) => {
                if (!relayIds.has(conn.remotePeer.toString())) {
                  conn.close().catch((err) => {
                    logger.p2p.debug('[DevTools] Error closing peer connection', {
                      peer: conn.remotePeer.toString(),
                      error: err instanceof Error ? err.message : 'Unknown error',
                    });
                  });
                  logger.p2p.info('[DevTools] Closed peer connection', {
                    peer: conn.remotePeer.toString(),
                  });
                }
              });
              // Reset store's connected status for immediate UI feedback
              setConnectedToPeer(false);
              setTimeout(onRefresh, 100);
            }}
          >
            <WifiOff className="h-3 w-3 mr-1" />
            Drop Peers
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const libp2p = getLibp2p();
              if (!libp2p) return;
              // Close ALL connections
              libp2p.getConnections().forEach((conn) => {
                conn.close().catch((err) => {
                  logger.p2p.debug('[DevTools] Error closing connection', {
                    peer: conn.remotePeer.toString(),
                    error: err instanceof Error ? err.message : 'Unknown error',
                  });
                });
              });
              // Reset store's connected status for immediate UI feedback
              setConnectedToPeer(false);
              logger.p2p.info('[DevTools] Dropped all connections');
              setTimeout(onRefresh, 100);
            }}
          >
            <Unplug className="h-3 w-3 mr-1" />
            Drop All
          </Button>
        </div>
      </div>

      {/* Simulate Connection Lost */}
      {onSimulateConnectionLost && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">UI State Testing</h4>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              logger.p2p.info('[DevTools] Simulating connection lost');
              onSimulateConnectionLost();
            }}
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            Trigger "Connection Lost"
          </Button>
        </div>
      )}

      {/* Message Queue */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">
          Message Queue ({pendingMessages.length})
        </h4>
        {pendingMessages.length > 0 ? (
          <div className="space-y-1 mb-2">
            {pendingMessages.map((msg) => (
              <div key={msg.id} className="rounded bg-muted/50 px-2 py-1 text-[10px] font-mono">
                <span className="text-muted-foreground">{msg.protocols.join(', ')}</span>
                <span className="ml-2">retries: {msg.retries}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground mb-2">No pending messages</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            clearMessageQueue();
            logger.p2p.info('[DevTools] Cleared message queue');
            onRefresh();
          }}
          disabled={pendingMessages.length === 0}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear Queue
        </Button>
      </div>

      {/* Peer ID Management */}
      {walletAddress && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Peer ID Storage</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                hasPeerId ? 'bg-green-500' : 'bg-gray-500'
              )}
            />
            {hasPeerId ? 'Stored in localStorage' : 'Not stored'}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (
                window.confirm(
                  'This will clear your stored peer ID. You will get a new identity on next connection. Continue?'
                )
              ) {
                clearStoredPeerId(walletAddress);
                logger.p2p.info('[DevTools] Cleared stored peer ID');
                onRefresh();
              }
            }}
            disabled={!hasPeerId}
          >
            <Key className="h-3 w-3 mr-1" />
            Clear Stored Peer ID
          </Button>
        </div>
      )}
    </div>
  );
}
