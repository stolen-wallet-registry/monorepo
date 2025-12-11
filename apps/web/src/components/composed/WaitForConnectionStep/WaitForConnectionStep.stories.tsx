import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PeerIdDisplay, PeerConnectForm } from '@/components/p2p';

/**
 * WaitForConnectionStep handles P2P connection establishment.
 *
 * Since the actual component has complex dependencies (wagmi, zustand stores, libp2p),
 * these stories render the internal UI states directly to demonstrate the visual states.
 *
 * States shown:
 * - Initializing: spinner while connecting to relay server
 * - Relayer waiting: shows copyable Peer ID
 * - Registeree ready: shows form to enter relayer's Peer ID
 */

const meta = {
  title: 'Composed/WaitForConnectionStep',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Initializing state - shown while P2P node connects to relay server.
 * Both roles show the same spinner.
 */
export const Initializing: Story = {
  render: () => (
    <div
      className="flex flex-col items-center justify-center py-12 space-y-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      <p className="text-muted-foreground">Connecting to relay server...</p>
    </div>
  ),
};

/**
 * Relayer waiting for registeree to connect.
 * Shows copyable Peer ID for sharing.
 */
export const RelayerWaiting: Story = {
  render: () => (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Share your Peer ID with the person registering their stolen wallet. They will use it to
          connect to you.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col items-center space-y-4">
        <p className="text-sm text-muted-foreground">Your Peer ID (click to copy):</p>
        <PeerIdDisplay peerId="12D3KooWQQ8eZz1PXHi93te3fzTDF9AKU32fMrSo6DoJc4mufbUR" />
        <p className="text-xs text-muted-foreground">Waiting for connection from registeree...</p>
      </div>
    </div>
  ),
};

/**
 * Relayer with a longer Peer ID to test truncation.
 */
export const RelayerLongPeerId: Story = {
  render: () => (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Share your Peer ID with the person registering their stolen wallet.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col items-center space-y-4">
        <p className="text-sm text-muted-foreground">Your Peer ID (click to copy):</p>
        <PeerIdDisplay peerId="12D3KooWNYnhyXneqn9mq6uHGeCM9bC9GMuLMXrKLUdass9yZfrK" />
        <p className="text-xs text-muted-foreground">Waiting for connection from registeree...</p>
      </div>
    </div>
  ),
};

/**
 * Registeree ready to connect.
 * Shows form to enter relayer's Peer ID.
 */
export const RegistereeReady: Story = {
  render: () => (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Enter the Peer ID shared by your relayer to establish a secure P2P connection. They will
          pay the gas fees on your behalf.
        </AlertDescription>
      </Alert>

      <PeerConnectForm
        onConnect={async () => console.log('Connect clicked')}
        isConnecting={false}
        error={null}
      />
    </div>
  ),
};

/**
 * Registeree currently connecting to relayer.
 */
export const RegistereeConnecting: Story = {
  render: () => (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Enter the Peer ID shared by your relayer to establish a secure P2P connection. They will
          pay the gas fees on your behalf.
        </AlertDescription>
      </Alert>

      <PeerConnectForm onConnect={async () => {}} isConnecting={true} error={null} />
    </div>
  ),
};

/**
 * Registeree with connection error.
 */
export const RegistereeError: Story = {
  render: () => (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Enter the Peer ID shared by your relayer to establish a secure P2P connection. They will
          pay the gas fees on your behalf.
        </AlertDescription>
      </Alert>

      <PeerConnectForm
        onConnect={async () => console.log('Connect clicked')}
        isConnecting={false}
        error="Connection timeout - peer may be offline"
      />
    </div>
  ),
};

/**
 * Registeree with invalid Peer ID error.
 */
export const RegistereeInvalidPeerId: Story = {
  render: () => (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Enter the Peer ID shared by your relayer to establish a secure P2P connection. They will
          pay the gas fees on your behalf.
        </AlertDescription>
      </Alert>

      <PeerConnectForm
        onConnect={async () => console.log('Connect clicked')}
        isConnecting={false}
        error="Invalid Peer ID format"
      />
    </div>
  ),
};
