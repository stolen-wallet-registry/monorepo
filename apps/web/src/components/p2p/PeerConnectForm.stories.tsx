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
      await new Promise((resolve) => setTimeout(resolve, 10000));
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
 * Form with validation error (after submitting invalid peer ID).
 * Note: Validation happens on submit, so this shows the form state
 * after attempting to connect with an invalid ID.
 */
export const ValidationError: Story = {
  args: {
    onConnect: async () => {},
  },
  render: (args) => {
    // This story simulates what happens after validation fails
    // In real usage, the validation error appears after form submission
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground mb-2">
          Enter an invalid peer ID and click connect to see validation error
        </p>
        <PeerConnectForm {...args} />
      </div>
    );
  },
};
