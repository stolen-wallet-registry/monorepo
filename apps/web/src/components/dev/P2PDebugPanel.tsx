/**
 * P2P Debug Panel - displays libp2p node information.
 *
 * Shows multiaddresses, protocols, and active connections with streams.
 * Uses a getter function to access libp2p to avoid React serialization issues.
 * Collapsible to avoid cluttering the UI.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bug, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { Libp2p } from 'libp2p';
import type { Connection } from '@libp2p/interface';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getRelayPeerIds } from '@/lib/p2p/types';

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
}: P2PDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  // Store extracted debug info in state (plain serializable data)
  // Initialize with empty state - will populate in useEffect to avoid SSR issues
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    peerId: null,
    multiaddrs: [],
    protocols: [],
    connections: [],
  });
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

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
  }, [getLibp2p]);

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
            </>
          )}
        </div>
      )}
    </div>
  );
}
