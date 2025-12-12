import type { Meta, StoryObj } from '@storybook/react';
import { ExplorerLink } from './ExplorerLink';

const meta = {
  title: 'Composed/ExplorerLink',
  component: ExplorerLink,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
Displays blockchain hashes/addresses with explorer links.

**Features:**
- **Searchable**: Full address in DOM, Ctrl+F finds and highlights visible portions
- **Truncation**: Shows start and end of address with ellipsis in middle
- **Tooltip**: Hover to see and copy full address
- **Explorer link**: Click to view on block explorer
- **Graceful degradation**: Shows disabled icon for local chains
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExplorerLink>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleTxHash = '0xf57a8d48fd5d24c81a61646d4faa902cacb46abc123def456789012345678901';
const sampleAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/**
 * Transaction hash with explorer link.
 * Hover to see full hash in tooltip.
 */
export const TransactionHash: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: `https://etherscan.io/tx/${sampleTxHash}`,
  },
};

/**
 * Address with explorer link.
 * Hover to see full address in tooltip.
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
 * Tooltip still works for viewing full address.
 */
export const NoLink: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: null,
  },
};

/**
 * Without link and without disabled icon.
 * Clean display for contexts where linking isn't applicable.
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
 * No tooltip since the full value is already visible.
 */
export const NotTruncated: Story = {
  args: {
    value: sampleTxHash as `0x${string}`,
    href: `https://etherscan.io/tx/${sampleTxHash}`,
    truncate: false,
  },
};

/**
 * Tooltip disabled.
 * Useful when the address is displayed elsewhere or in tight spaces.
 */
export const NoTooltip: Story = {
  args: {
    value: sampleAddress as `0x${string}`,
    href: `https://etherscan.io/address/${sampleAddress}`,
    showTooltip: false,
  },
};

/**
 * Multiple addresses demonstrating Ctrl+F searchability.
 * Try searching for any part of the address - browser highlights visible portions.
 */
export const MultipleAddresses: Story = {
  name: 'Multiple Addresses',
  args: {
    value: sampleAddress as `0x${string}`,
  },
  render: () => (
    <div className="space-y-4 p-4 bg-muted rounded-lg">
      <p className="text-sm text-muted-foreground mb-4">
        Try Ctrl+F to search - full addresses are findable and highlightable
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <span className="text-sm w-24">Address:</span>
          <ExplorerLink
            value={sampleAddress as `0x${string}`}
            href={`https://etherscan.io/address/${sampleAddress}`}
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm w-24">Tx Hash:</span>
          <ExplorerLink
            value={sampleTxHash as `0x${string}`}
            href={`https://etherscan.io/tx/${sampleTxHash}`}
          />
        </div>
      </div>
    </div>
  ),
};
