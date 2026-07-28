/**
 * Read-only view of the libp2p node snapshot: peer ID, listen addresses, registered
 * protocols and live connections.
 *
 * Purely renders the DebugInfo it is handed - the panel owns polling and refresh.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ConnectionInfo, DebugInfo } from './debugInfo';

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

interface P2PNodeInfoProps {
  /** Latest snapshot of the node */
  debugInfo: DebugInfo;
  /** Timestamp of the last successful refresh, or null if never refreshed */
  lastUpdated: number | null;
  /** Re-read the node and update the snapshot */
  onRefresh: () => void;
}

export function P2PNodeInfo({ debugInfo, lastUpdated, onRefresh }: P2PNodeInfoProps) {
  const { peerId, multiaddrs, protocols, connections } = debugInfo;

  return (
    <>
      {/* Peer ID */}
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground">Peer ID</h4>
          <button
            type="button"
            onClick={onRefresh}
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
            {multiaddrs.map((ma) => (
              <p key={ma} className="font-mono text-[10px] text-muted-foreground break-all">
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
            {protocols.map((p) => (
              <span
                key={p}
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
  );
}
