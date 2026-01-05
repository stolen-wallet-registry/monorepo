import type { Meta, StoryObj } from '@storybook/react';
import { CrossChainRelayProgress } from './CrossChainRelayProgress';
import type { Hash } from '@/lib/types/ethereum';

const meta: Meta<typeof CrossChainRelayProgress> = {
  title: 'Composed/CrossChainRelayProgress',
  component: CrossChainRelayProgress,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CrossChainRelayProgress>;

const sampleMessageId =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hash;

/**
 * Relay in progress with message ID and explorer link.
 */
export const InProgress: Story = {
  args: {
    elapsedTime: 15000, // 15 seconds
    hubChainName: 'Base',
    bridgeName: 'Hyperlane',
    messageId: sampleMessageId,
    explorerUrl: 'https://explorer.hyperlane.xyz/message/' + sampleMessageId,
  },
};

/**
 * Relay in progress before message ID is available.
 */
export const InProgressNoMessageId: Story = {
  args: {
    elapsedTime: 5000, // 5 seconds
    hubChainName: 'Base',
    bridgeName: 'Hyperlane',
  },
};

/**
 * Long wait time (shows minutes format).
 */
export const LongWait: Story = {
  args: {
    elapsedTime: 95000, // 1m 35s
    hubChainName: 'Base Sepolia',
    bridgeName: 'Hyperlane',
    messageId: sampleMessageId,
    explorerUrl: 'https://explorer.hyperlane.xyz/message/' + sampleMessageId,
  },
};

/**
 * With Wormhole bridge (alternate provider).
 */
export const WormholeBridge: Story = {
  args: {
    elapsedTime: 30000, // 30 seconds
    hubChainName: 'Base',
    bridgeName: 'Wormhole',
    messageId: sampleMessageId,
  },
};

/**
 * Default hub chain name (when not specified).
 */
export const DefaultHubName: Story = {
  args: {
    elapsedTime: 10000,
    bridgeName: 'Hyperlane',
  },
};
