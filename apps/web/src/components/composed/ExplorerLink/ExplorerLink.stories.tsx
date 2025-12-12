import type { Meta, StoryObj } from '@storybook/react';
import { ExplorerLink } from './ExplorerLink';

const meta = {
  title: 'Composed/ExplorerLink',
  component: ExplorerLink,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExplorerLink>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleTxHash = '0xf57a8d48fd5d24c81a61646d4faa902cacb46abc123def456789012345678901';
const sampleAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/**
 * Transaction hash with explorer link.
 */
export const TransactionHash: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: `https://etherscan.io/tx/${sampleTxHash}`,
  },
};

/**
 * Address with explorer link.
 */
export const Address: Story = {
  args: {
    value: sampleAddress as `0x${string}`,
    href: `https://etherscan.io/address/${sampleAddress}`,
  },
};

/**
 * Without link (local chain / no explorer).
 * Shows disabled external link icon to indicate the feature exists.
 */
export const NoLink: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: null,
  },
};

/**
 * Without link and without disabled icon.
 */
export const NoLinkNoIcon: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: null,
    showDisabledIcon: false,
  },
};

/**
 * Full value without truncation.
 */
export const NotTruncated: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: `https://etherscan.io/tx/${sampleTxHash}`,
    truncate: false,
  },
};
