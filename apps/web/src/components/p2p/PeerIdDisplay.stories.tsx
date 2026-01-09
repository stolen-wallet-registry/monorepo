import type { Meta, StoryObj } from '@storybook/react';
import { PeerIdDisplay } from './PeerIdDisplay';

const meta: Meta<typeof PeerIdDisplay> = {
  title: 'P2P/PeerIdDisplay',
  component: PeerIdDisplay,
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
type Story = StoryObj<typeof PeerIdDisplay>;

// Sample libp2p peer ID (Ed25519 format)
const samplePeerId = '12D3KooWRm4v4SJkzD5HQkJCZnxYFCCjMhAGVxhxzqF7bPQFGXpt';

/**
 * Loading state - connecting to P2P relay.
 */
export const Loading: Story = {
  args: {
    peerId: null,
    isLoading: true,
  },
};

/**
 * Not initialized - P2P node failed to start.
 */
export const NotInitialized: Story = {
  args: {
    peerId: null,
    isLoading: false,
  },
};

/**
 * Ready state - peer ID displayed with copy button.
 */
export const Ready: Story = {
  args: {
    peerId: samplePeerId,
    isLoading: false,
  },
};

/**
 * With a longer peer ID (RSA format).
 */
export const LongPeerId: Story = {
  args: {
    peerId: 'QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N',
    isLoading: false,
  },
};
