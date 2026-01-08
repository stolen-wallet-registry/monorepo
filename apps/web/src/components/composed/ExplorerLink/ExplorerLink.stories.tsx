import type { Meta, StoryObj } from '@storybook/react';
import { ExplorerLink } from '.';
import type { Address as AddressType, Hash } from '@/lib/types/ethereum';

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
- **Type-aware labels**: Automatically detects address vs transaction by length, or set explicitly
- **Full value tooltip**: Hover over truncated values to see full hash/address
- **Searchable**: Full address in DOM, Ctrl+F finds and highlights visible portions
- **Truncation**: Shows start and end of address with ellipsis in middle
- **Copy button**: Click to copy with type-specific label (e.g., "Copy transaction hash")
- **Explorer link**: Click to view on explorer with type-specific tooltip
- **Disabled state**: Shows not-allowed cursor with tooltip for local chains

**Supported types:**
- \`address\` (default for 42 char values)
- \`transaction\` (default for 66 char values)
- \`contract\`, \`token\`, \`block\` (explicit only)
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExplorerLink>;

export default meta;
type Story = StoryObj<typeof meta>;

// Standard 32-byte tx hash fixture (0x + 64 hex chars = 66 chars total)
const sampleTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const sampleAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/**
 * Transaction hash with explorer link.
 * Type auto-detected from length (66 chars = transaction).
 * Hover over value for full hash, hover copy icon for "Copy transaction hash".
 */
export const TransactionHash: Story = {
  args: {
    value: sampleTxHash as Hash,
    href: `https://etherscan.io/tx/${sampleTxHash}`,
  },
};

/**
 * Wallet address with explorer link.
 * Type auto-detected from length (42 chars = address).
 * Hover over value for full address, hover copy icon for "Copy address".
 */
export const Address: Story = {
  args: {
    value: sampleAddress as AddressType,
    href: `https://etherscan.io/address/${sampleAddress}`,
  },
};

/**
 * Contract address with explicit type.
 * Shows "Copy contract address" and "View contract on explorer" tooltips.
 */
export const ContractAddress: Story = {
  args: {
    value: sampleAddress as AddressType,
    type: 'contract',
    href: `https://etherscan.io/address/${sampleAddress}`,
  },
};

/**
 * Token address with explicit type.
 * Shows "Copy token address" and "View token on explorer" tooltips.
 */
export const TokenAddress: Story = {
  args: {
    value: sampleAddress as AddressType,
    type: 'token',
    href: `https://etherscan.io/token/${sampleAddress}`,
  },
};

/**
 * Without link (local chain / no explorer).
 * Disabled link icon shows not-allowed cursor with explanatory tooltip.
 */
export const NoLink: Story = {
  args: {
    value: sampleTxHash as Hash,
    href: null,
  },
};

/**
 * Without link and without disabled icon.
 * Clean display for contexts where linking isn't applicable.
 */
export const NoLinkNoIcon: Story = {
  args: {
    value: sampleTxHash as Hash,
    href: null,
    showDisabledIcon: false,
  },
};

/**
 * Full value without truncation.
 * Shows complete address inline.
 */
export const NotTruncated: Story = {
  args: {
    value: sampleTxHash as Hash,
    href: `https://etherscan.io/tx/${sampleTxHash}`,
    truncate: false,
  },
};

/**
 * Without copy button.
 * Useful in tight spaces or when copy isn't needed.
 */
export const NoCopyButton: Story = {
  args: {
    value: sampleAddress as AddressType,
    href: `https://etherscan.io/address/${sampleAddress}`,
    showCopyButton: false,
  },
};

/**
 * Multiple addresses demonstrating Ctrl+F searchability.
 * Try searching for any part of the address - browser highlights visible portions.
 */
export const MultipleAddresses: Story = {
  name: 'Multiple Addresses',
  args: {
    value: sampleAddress as AddressType,
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
            value={sampleAddress as AddressType}
            href={`https://etherscan.io/address/${sampleAddress}`}
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm w-24">Tx Hash:</span>
          <ExplorerLink
            value={sampleTxHash as Hash}
            href={`https://etherscan.io/tx/${sampleTxHash}`}
          />
        </div>
      </div>
    </div>
  ),
};
