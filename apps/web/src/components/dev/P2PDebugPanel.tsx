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
import { Bug, ChevronDown, ChevronRight } from 'lucide-react';
import type { Libp2p } from 'libp2p';

import { Button, Separator } from '@swr/ui';
import { cn } from '@/lib/utils';
import { getRelayPeerIds } from '@/lib/p2p/types';
import { hasStoredPeerId } from '@/lib/p2p/peerId';
import { getPendingMessages, type QueuedMessage } from '@/lib/p2p/messageQueue';
import { useP2PStore } from '@/stores/p2pStore';
import { extractDebugInfo, type DebugInfo } from './p2p-debug/debugInfo';
import { P2PNodeInfo } from './p2p-debug/P2PNodeInfo';
import { P2PDebugControls } from './p2p-debug/P2PDebugControls';

/** Cached relay peer IDs - computed once on first access, static thereafter */
let relayPeerIdsCache: Set<string> | null = null;

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

  // Read the lazily-initialized relay IDs at call time, never at render time.
  // Plain function, not a hook: it closes over a ref, so it never needs memoizing.
  const getCachedRelayPeerIds = () => relayPeerIdsRef.current ?? new Set<string>();

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

  const hasNode = debugInfo.peerId !== null;

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
              <P2PNodeInfo debugInfo={debugInfo} lastUpdated={lastUpdated} onRefresh={refresh} />

              {/* Dev Tools Section - shown directly, no nested toggle */}
              <Separator className="my-2" />
              <P2PDebugControls
                getLibp2p={getLibp2p}
                getRelayPeerIds={getCachedRelayPeerIds}
                onRefresh={refresh}
                setConnectedToPeer={setConnectedToPeer}
                pendingMessages={pendingMessages}
                walletAddress={walletAddress}
                hasPeerId={hasPeerId}
                onSimulateConnectionLost={onSimulateConnectionLost}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
