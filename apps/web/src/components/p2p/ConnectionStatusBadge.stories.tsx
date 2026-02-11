import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import type { ConnectionHealth } from '@/hooks/p2p/useP2PConnectionHealth';

const meta = {
  title: 'P2P/ConnectionStatusBadge',
  component: ConnectionStatusBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['healthy', 'degraded', 'disconnected', 'unknown'],
      description: 'Connection status',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Badge size',
    },
    showLabel: {
      control: 'boolean',
      description: 'Show status label text',
    },
  },
} satisfies Meta<typeof ConnectionStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock health data for different states
const healthyHealth: ConnectionHealth = {
  relayConnected: true,
  peerConnected: true,
  lastRelayPing: null,
  lastPeerPing: 45,
  status: 'healthy',
  relayFailures: 0,
  peerFailures: 0,
  lastCheckAt: Date.now(),
};

const degradedHealth: ConnectionHealth = {
  relayConnected: true,
  peerConnected: true,
  lastRelayPing: null,
  lastPeerPing: 3500,
  status: 'degraded',
  relayFailures: 0,
  peerFailures: 1,
  lastCheckAt: Date.now(),
};

const disconnectedHealth: ConnectionHealth = {
  relayConnected: true,
  peerConnected: false,
  lastRelayPing: null,
  lastPeerPing: null,
  status: 'disconnected',
  relayFailures: 0,
  peerFailures: 3,
  lastCheckAt: Date.now(),
};

const unknownHealth: ConnectionHealth = {
  relayConnected: false,
  peerConnected: false,
  lastRelayPing: null,
  lastPeerPing: null,
  status: 'unknown',
  relayFailures: 0,
  peerFailures: 0,
  lastCheckAt: null,
};

/**
 * Healthy connection - green pulsing dot with wifi icon.
 * Indicates both relay and peer connections are working well.
 */
export const Healthy: Story = {
  args: {
    status: 'healthy',
    health: healthyHealth,
  },
};

/**
 * Healthy connection with label shown.
 */
export const HealthyWithLabel: Story = {
  args: {
    status: 'healthy',
    health: healthyHealth,
    showLabel: true,
  },
};

/**
 * Degraded connection - yellow indicator.
 * High latency (>3000ms) but still connected.
 */
export const Degraded: Story = {
  args: {
    status: 'degraded',
    health: degradedHealth,
  },
};

/**
 * Degraded connection with label.
 */
export const DegradedWithLabel: Story = {
  args: {
    status: 'degraded',
    health: degradedHealth,
    showLabel: true,
  },
};

/**
 * Disconnected - red indicator.
 * Connection to peer has been lost.
 */
export const Disconnected: Story = {
  args: {
    status: 'disconnected',
    health: disconnectedHealth,
  },
};

/**
 * Disconnected with label.
 */
export const DisconnectedWithLabel: Story = {
  args: {
    status: 'disconnected',
    health: disconnectedHealth,
    showLabel: true,
  },
};

/**
 * Unknown status - gray indicator.
 * Initial state before first health check completes.
 */
export const Unknown: Story = {
  args: {
    status: 'unknown',
    health: unknownHealth,
  },
};

/**
 * Unknown with label - shows "Checking..." text.
 */
export const UnknownWithLabel: Story = {
  args: {
    status: 'unknown',
    health: unknownHealth,
    showLabel: true,
  },
};

/**
 * Medium size variant.
 */
export const MediumSize: Story = {
  args: {
    status: 'healthy',
    health: healthyHealth,
    size: 'md',
    showLabel: true,
  },
};

/**
 * Status without detailed health info.
 * Tooltip shows only the status label.
 */
export const WithoutHealthDetails: Story = {
  args: {
    status: 'healthy',
  },
};

/**
 * All states side by side for comparison.
 */
export const AllStates: Story = {
  args: {
    status: 'healthy',
  },
  render: function AllStatesComparison() {
    return (
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <ConnectionStatusBadge status="healthy" health={healthyHealth} showLabel />
          <span className="text-xs text-muted-foreground">Healthy</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ConnectionStatusBadge status="degraded" health={degradedHealth} showLabel />
          <span className="text-xs text-muted-foreground">Degraded</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ConnectionStatusBadge status="disconnected" health={disconnectedHealth} showLabel />
          <span className="text-xs text-muted-foreground">Disconnected</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ConnectionStatusBadge status="unknown" health={unknownHealth} showLabel />
          <span className="text-xs text-muted-foreground">Unknown</span>
        </div>
      </div>
    );
  },
};
