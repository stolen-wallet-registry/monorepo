import type { Meta, StoryObj } from '@storybook/react';
import { PeerConnectForm } from './PeerConnectForm';

const meta: Meta<typeof PeerConnectForm> = {
  title: 'P2P/PeerConnectForm',
  component: PeerConnectForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PeerConnectForm>;

/**
 * Default empty form ready for peer ID input.
 */
export const Default: Story = {
  args: {
    onConnect: async (peerId) => {
      console.log('Connecting to:', peerId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
  },
};

/**
 * Connecting state - button shows loading, input disabled.
 */
export const Connecting: Story = {
  args: {
    onConnect: async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    },
    isConnecting: true,
  },
};

/**
 * Connection error - shows error message passed from parent component.
 *
 * This demonstrates the `error` prop which displays errors from the parent
 * (e.g., peer unreachable, connection timeout). This is separate from
 * inline Zod validation errors that appear after submitting invalid input.
 */
export const ConnectionError: Story = {
  args: {
    onConnect: async () => {},
    error: 'Connection refused. The peer may be offline or unreachable.',
  },
};

/**
 * Interactive story to test form validation.
 *
 * To see inline validation errors:
 * 1. Enter an invalid peer ID (e.g., "invalid" or "12345")
 * 2. Click "Connect to Peer"
 * 3. Zod validation will show "Invalid Peer ID. Please check and try again."
 *
 * Valid peer IDs start with "12D3KooW" (Ed25519) or "Qm" (RSA).
 */
export const Interactive: Story = {
  args: {
    onConnect: async (peerId) => {
      console.log('Attempting to connect to:', peerId);
      // Simulate connection attempt
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
  },
};
