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
 * Default empty form ready for a pairing code.
 */
export const Default: Story = {
  args: {
    onConnect: async (pairingCode) => {
      console.log('Connecting with:', pairingCode);
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
 * A valid code looks like `swr1:<peer id>:<0x wallet address>`. Three refusals are worth
 * seeing, because they are the security surface of this input:
 * 1. Junk ("invalid") — "That is not a pairing code."
 * 2. A BARE PEER ID ("12D3KooW...") — refused with its own message telling the user to ask
 *    for the full code. Accepting it would pair with no wallet at all, which is exactly the
 *    unauthorized-wallet path the code exists to close (audit V4).
 * 3. A code carrying a malformed address or peer ID.
 */
export const Interactive: Story = {
  args: {
    onConnect: async (pairingCode) => {
      console.log('Attempting to connect with:', pairingCode);
      // Simulate connection attempt
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
  },
};
