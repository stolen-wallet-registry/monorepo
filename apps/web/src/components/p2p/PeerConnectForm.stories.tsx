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
 * Connection error - shows error message from parent.
 */
export const ConnectionError: Story = {
  args: {
    onConnect: async () => {},
    error: 'Connection refused. The peer may be offline or unreachable.',
  },
};

/**
 * Form with connection error from parent (e.g., peer unreachable).
 * Note: Form validation errors appear inline after submission.
 * This story shows the error prop passed from parent after connection fails.
 */
export const WithError: Story = {
  args: {
    onConnect: async () => {},
    error: 'Invalid Peer ID. Please check and try again.',
  },
};
