/**
 * Connection status indicator badge for P2P connections.
 *
 * Displays a colored dot with tooltip showing connection health details.
 */

import { Wifi, WifiOff, WifiLow } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Badge } from '@swr/ui';
import type { ConnectionStatus, ConnectionHealth } from '@/hooks/useP2PConnectionHealth';

export interface ConnectionStatusBadgeProps {
  /** Current connection status */
  status: ConnectionStatus;
  /** Full health details for tooltip (optional) */
  health?: ConnectionHealth;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Whether to show the label text */
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  {
    color: string;
    bgColor: string;
    label: string;
    icon: typeof Wifi;
  }
> = {
  healthy: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500',
    label: 'Connected',
    icon: Wifi,
  },
  degraded: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500',
    label: 'Slow',
    icon: WifiLow,
  },
  disconnected: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500',
    label: 'Disconnected',
    icon: WifiOff,
  },
  unknown: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted-foreground',
    label: 'Checking...',
    icon: Wifi,
  },
};

/**
 * Visual indicator of P2P connection health.
 *
 * Shows a colored icon that indicates connection status:
 * - Green: Healthy connection to relay and peer
 * - Yellow: Degraded (high latency or reconnecting)
 * - Red: Disconnected
 * - Gray: Unknown/checking
 *
 * @example
 * ```tsx
 * <ConnectionStatusBadge status={health.status} health={health} />
 * ```
 */
export function ConnectionStatusBadge({
  status,
  health,
  size = 'sm',
  showLabel = false,
}: ConnectionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  const tooltipContent = health ? (
    <div className="space-y-1 text-xs">
      <div className="font-medium">{config.label}</div>
      <div className="opacity-70">
        <div>Relay: {health.relayConnected ? 'Connected' : 'Disconnected'}</div>
        <div>Peer: {health.peerConnected ? 'Connected' : 'Disconnected'}</div>
        {health.lastPeerPing !== null && <div>Latency: {health.lastPeerPing}ms</div>}
        {health.lastCheckAt && (
          <div>Last check: {new Date(health.lastCheckAt).toLocaleTimeString()}</div>
        )}
      </div>
    </div>
  ) : (
    config.label
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1.5 px-2 py-0.5 cursor-default">
            <span className={`relative flex ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'}`}>
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${config.bgColor} ${status === 'healthy' ? 'animate-ping opacity-75' : ''}`}
                style={{ animationDuration: '3s' }}
              />
              <span
                className={`relative inline-flex rounded-full h-full w-full ${config.bgColor}`}
              />
            </span>
            <Icon className={`${iconSize} ${config.color}`} />
            {showLabel && <span className={`text-xs ${config.color}`}>{config.label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
