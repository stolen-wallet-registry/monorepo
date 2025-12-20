/**
 * P2P Debug Panel - displays libp2p node information.
 *
 * Shows multiaddresses, protocols, and active connections with streams.
 * Collapsible to avoid cluttering the UI.
 *
 * Includes dev tools for testing connection states and reconnection flows.
 *
 * IMPORTANT: Uses a getter function (`getLibp2p`) instead of passing libp2p directly.
 * libp2p uses a Proxy that throws MissingServiceError when unknown properties are accessed.
 * React DevTools tries to serialize props (accessing `$typeof`, etc.), which crashes the app.
 * Passing a getter function avoids this because functions aren't deeply inspected.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bug,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Unplug,
  WifiOff,
  Trash2,
  Key,
  AlertTriangle,
} from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Connection } from '@libp2p/interface';

import { Button, Separator } from '@swr/ui';
import { cn } from '@/lib/utils';
import { getRelayPeerIds } from '@/lib/p2p/types';
import { clearStoredPeerId, hasStoredPeerId } from '@/lib/p2p/peerId';
import { getPendingMessages, clearMessageQueue, type QueuedMessage } from '@/lib/p2p/messageQueue';
import { useP2PStore } from '@/stores/p2pStore';
import { logger } from '@/lib/logger';

/** Cached relay peer IDs - computed once on first access, static thereafter */
let relayPeerIdsCache: Set<string> | null = null;

interface ConnectionInfo {
  id: string;
  remoteAddr: string;
  remotePeer: string;
  direction: 'inbound' | 'outbound';
  multiplexer?: string;
  encryption?: string;
  status: string;
  /** Whether this connection is to a known relay server */
  isRelay: boolean;
  streams: {
    id: string;
    protocol?: string;
    direction: string;
    status: string;
  }[];
}

interface DebugInfo {
  peerId: string | null;
  multiaddrs: string[];
  protocols: string[];
  connections: ConnectionInfo[];
}

interface P2PDebugPanelProps {
  /**
   * Getter function that returns the libp2p node.
   * Using a getter avoids React trying to serialize the libp2p object.
   */
  getLibp2p: () => Libp2p | null;
  /** Whether to expand the panel by default */
  defaultExpanded?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Connected wallet address (for peer ID management) */
  walletAddress?: string;
  /** Callback to trigger connection lost state (for testing) */
  onSimulateConnectionLost?: () => void;
}

/**
 * Extract connection info from a libp2p Connection object.
 * @param conn - The connection to extract info from
 * @param relayPeerIds - Set of known relay peer IDs for tagging
 */
function extractConnectionInfo(conn: Connection, relayPeerIds: Set<string>): ConnectionInfo {
  const remotePeerId = conn.remotePeer.toString();

  return {
    id: conn.id,
    remoteAddr: conn.remoteAddr.toString(),
    remotePeer: remotePeerId,
    direction: conn.direction,
    multiplexer: conn.multiplexer,
    encryption: conn.encryption,
    status: conn.status,
    isRelay: relayPeerIds.has(remotePeerId),
    streams: conn.streams.map((stream) => ({
      id: stream.id,
      protocol: stream.protocol,
      direction: stream.direction,
      status: stream.status,
    })),
  };
}

/**
 * Collapsible section for a single connection.
 */
function ConnectionSection({ connection }: { connection: ConnectionInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded border border-border bg-muted/30 p-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-1 text-left text-xs"
        aria-expanded={isExpanded}
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            connection.status === 'open' ? 'bg-green-500' : 'bg-gray-500'
          )}
        />
        <span className="font-medium truncate flex-1">{connection.remotePeer.slice(0, 20)}...</span>
        {connection.isRelay && (
          <span
            className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400"
            title="Known relay server"
          >
            relay
          </span>
        )}
        <span className="text-muted-foreground">{connection.direction}</span>
      </button>
      {isExpanded && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          <div>
            <span className="text-muted-foreground">Remote Addr:</span>
            <p className="break-all font-mono text-[10px]">{connection.remoteAddr}</p>
          </div>
          <div className="flex gap-4">
            <span>
              <span className="text-muted-foreground">Mux:</span> {connection.multiplexer || 'n/a'}
            </span>
            <span>
              <span className="text-muted-foreground">Enc:</span> {connection.encryption || 'n/a'}
            </span>
          </div>
          {connection.streams.length > 0 && (
            <div className="mt-2">
              <span className="text-muted-foreground">Streams ({connection.streams.length}):</span>
              <div className="mt-1 space-y-1">
                {connection.streams.map((stream) => (
                  <div
                    key={stream.id}
                    className="flex gap-2 rounded bg-muted/50 px-1 py-0.5 text-[10px]"
                  >
                    <span className="font-mono">{stream.protocol || 'unknown'}</span>
                    <span className="text-muted-foreground">{stream.direction}</span>
                    <span
                      className={cn(stream.status === 'open' ? 'text-green-400' : 'text-gray-400')}
                    >
                      {stream.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Extract debug info from libp2p node.
 * Safely handles node being null or shutting down.
 * @param libp2p - The libp2p node (or null)
 * @param relayPeerIds - Set of known relay peer IDs for tagging connections
 */
function extractDebugInfo(libp2p: Libp2p | null, relayPeerIds: Set<string>): DebugInfo {
  if (!libp2p) {
    return {
      peerId: null,
      multiaddrs: [],
      protocols: [],
      connections: [],
    };
  }

  try {
    return {
      peerId: libp2p.peerId.toString(),
      multiaddrs: libp2p.getMultiaddrs().map((ma) => ma.toString()),
      protocols: libp2p.getProtocols(),
      connections: libp2p.getConnections().map((c) => extractConnectionInfo(c, relayPeerIds)),
    };
  } catch {
    // Node may be shutting down
    return {
      peerId: null,
      multiaddrs: [],
      protocols: [],
      connections: [],
    };
  }
}

/**
 * P2P Debug Panel component.
 *
 * Displays libp2p node details in a collapsible panel.
 * Auto-refreshes every 15 seconds when expanded.
 *
 * Uses a getter function instead of passing libp2p directly as a prop
 * to avoid React DevTools serialization issues with libp2p's internal getters.
 */
export function P2PDebugPanel({
  getLibp2p,
  defaultExpanded = false,
  className,
  walletAddress,
  onSimulateConnectionLost,
}: P2PDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { setConnectedToPeer } = useP2PStore();
  // Store extracted debug info in state (plain serializable data)
  // Initialize with empty state - will populate in useEffect to avoid SSR issues
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    peerId: null,
    multiaddrs: [],
    protocols: [],
    connections: [],
  });
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [pendingMessages, setPendingMessages] = useState<QueuedMessage[]>([]);
  const [hasPeerId, setHasPeerId] = useState(false);

  // Lazy-load relay peer IDs once on client - they're static and won't change
  const relayPeerIdsRef = useRef<Set<string> | null>(null);

  // Initialize relay peer IDs on first client render
  useEffect(() => {
    if (!relayPeerIdsCache) {
      relayPeerIdsCache = getRelayPeerIds();
    }
    relayPeerIdsRef.current = relayPeerIdsCache;
  }, []);

  // Manual refresh function - extracts fresh data from node
  const refresh = useCallback(() => {
    const libp2p = getLibp2p();
    const relayIds = relayPeerIdsRef.current ?? new Set<string>();
    setDebugInfo(extractDebugInfo(libp2p, relayIds));
    setLastUpdated(Date.now());
    setPendingMessages(getPendingMessages());
    if (walletAddress) {
      setHasPeerId(hasStoredPeerId(walletAddress));
    }
  }, [getLibp2p, walletAddress]);

  // Auto-refresh every 15 seconds when expanded
  // Note: Timer starts when panel is expanded, even if node isn't ready yet.
  // This allows auto-refresh to work if node initializes after panel is opened.
  useEffect(() => {
    if (!isExpanded) return;

    // Initial refresh when opening - use setTimeout to avoid sync setState in effect
    const initialTimeout = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 15000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isExpanded, refresh]);

  // Only render in development
  if (import.meta.env.PROD) {
    return null;
  }

  const { peerId, multiaddrs, protocols, connections } = debugInfo;
  const hasNode = peerId !== null;

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      {/* Toggle Header */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between px-3 py-2 h-auto"
        aria-expanded={isExpanded}
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          <Bug className="h-4 w-4" />
          P2P Debug
          {!hasNode && <span className="text-muted-foreground font-normal">(no node)</span>}
        </span>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3">
          {!hasNode ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              P2P node not initialized
            </p>
          ) : (
            <>
              {/* Peer ID */}
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-muted-foreground">Peer ID</h4>
                  <button
                    type="button"
                    onClick={refresh}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Refresh"
                    aria-label="Refresh P2P debug info"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-1 font-mono text-xs break-all">{peerId}</p>
              </div>

              {/* Multiaddresses */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground">
                  Multiaddresses ({multiaddrs.length})
                </h4>
                {multiaddrs.length > 0 ? (
                  <div className="mt-1 max-h-20 overflow-y-auto space-y-1">
                    {multiaddrs.map((ma, i) => (
                      <p key={i} className="font-mono text-[10px] text-muted-foreground break-all">
                        {ma}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] text-muted-foreground">No multiaddresses</p>
                )}
              </div>

              {/* Protocols */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground">
                  Protocols ({protocols.length})
                </h4>
                {protocols.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {protocols.map((p, i) => (
                      <span
                        key={i}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] text-muted-foreground">No protocols</p>
                )}
              </div>

              {/* Connections */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground">
                  Connections ({connections.length})
                </h4>
                {connections.length > 0 ? (
                  <div className="mt-1 space-y-2">
                    {connections.map((conn) => (
                      <ConnectionSection key={conn.id} connection={conn} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] text-muted-foreground">No active connections</p>
                )}
              </div>

              {/* Last Updated */}
              {lastUpdated && (
                <p className="text-center text-[10px] text-muted-foreground">
                  Updated: {new Date(lastUpdated).toLocaleTimeString()}
                </p>
              )}

              {/* Dev Tools Section - shown directly, no nested toggle */}
              <Separator className="my-2" />
              <div className="space-y-3">
                {/* Connection Controls */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    Connection Controls
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const libp2p = getLibp2p();
                        if (!libp2p) return;
                        // Close all connections to relay servers
                        const relayIds = relayPeerIdsRef.current ?? new Set<string>();
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
                        setTimeout(refresh, 100);
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
                        const relayIds = relayPeerIdsRef.current ?? new Set<string>();
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
                        setTimeout(refresh, 100);
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
                        setTimeout(refresh, 100);
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
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                      UI State Testing
                    </h4>
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
                        <div
                          key={msg.id}
                          className="rounded bg-muted/50 px-2 py-1 text-[10px] font-mono"
                        >
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
                      refresh();
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
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                      Peer ID Storage
                    </h4>
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
                          refresh();
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
