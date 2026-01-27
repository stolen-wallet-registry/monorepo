import type { Meta, StoryObj } from '@storybook/react';
import { EnsExplorerLink } from '.';
import { ExplorerLink } from '@swr/ui';
import type { Address } from '@/lib/types/ethereum';
import { withWeb3 } from '../../../../.storybook/Web3Decorator';

const meta = {
  title: 'Composed/EnsExplorerLink',
  component: EnsExplorerLink,
  decorators: [withWeb3],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
ExplorerLink wrapper with automatic ENS name resolution.

**Use this instead of ExplorerLink** when displaying addresses that might have ENS names.

**Features:**
- Automatically resolves addresses to ENS names via mainnet
- Shows ENS name with full address in tooltip
- Loading skeleton while ENS resolves
- Falls back to truncated address if no ENS name
- Can disable ENS resolution with \`resolveEns={false}\`

**Caching:**
- 5 minute stale time, 30 minute garbage collection
- Reduces RPC calls for frequently displayed addresses
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EnsExplorerLink>;

export default meta;
type Story = StoryObj<typeof meta>;

// Well-known addresses with ENS names (these resolve on mainnet)
const vitalikAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address;
// Random address unlikely to have ENS
const randomAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

/**
 * Address with ENS name.
 * Will show "vitalik.eth" with full address in tooltip.
 *
 * Note: Requires mainnet RPC connection to resolve ENS names.
 */
export const WithEnsName: Story = {
  args: {
    value: vitalikAddress,
    href: `https://etherscan.io/address/${vitalikAddress}`,
  },
};

/**
 * Address without ENS name.
 * Falls back to showing truncated address.
 */
export const WithoutEnsName: Story = {
  args: {
    value: randomAddress,
    href: `https://etherscan.io/address/${randomAddress}`,
  },
};

/**
 * ENS resolution disabled.
 * Shows truncated address without attempting resolution.
 */
export const EnsDisabled: Story = {
  args: {
    value: vitalikAddress,
    href: `https://etherscan.io/address/${vitalikAddress}`,
    resolveEns: false,
  },
};

/**
 * Loading state demonstration.
 * Shows how the component appears while ENS is resolving.
 */
export const LoadingState: Story = {
  args: {
    value: randomAddress,
    href: `https://etherscan.io/address/${randomAddress}`,
  },
  render: (args) => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ExplorerLink with ensLoading=true shows a skeleton:
      </p>
      <ExplorerLink value={args.value} href={args.href} ensLoading={true} />
    </div>
  ),
};

/**
 * Comparison with regular ExplorerLink.
 * Shows the difference between ENS-resolved and non-resolved display.
 */
export const Comparison: Story = {
  args: {
    value: vitalikAddress,
    href: `https://etherscan.io/address/${vitalikAddress}`,
  },
  render: () => (
    <div className="space-y-4 p-4 bg-muted rounded-lg">
      <div className="flex items-center gap-4">
        <span className="text-sm w-32">With ENS:</span>
        <EnsExplorerLink
          value={vitalikAddress}
          href={`https://etherscan.io/address/${vitalikAddress}`}
        />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-32">Without ENS:</span>
        <EnsExplorerLink
          value={vitalikAddress}
          href={`https://etherscan.io/address/${vitalikAddress}`}
          resolveEns={false}
        />
      </div>
    </div>
  ),
};

/**
 * Multiple addresses demonstrating caching.
 * Repeated addresses use cached ENS resolution.
 */
export const MultipleAddresses: Story = {
  args: {
    value: vitalikAddress,
    href: `https://etherscan.io/address/${vitalikAddress}`,
  },
  render: () => (
    <div className="space-y-4 p-4 bg-muted rounded-lg">
      <p className="text-sm text-muted-foreground mb-4">
        Same address shown multiple times uses cached ENS resolution
      </p>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <span className="text-sm w-24">Row {i}:</span>
            <EnsExplorerLink
              value={vitalikAddress}
              href={`https://etherscan.io/address/${vitalikAddress}`}
            />
          </div>
        ))}
      </div>
    </div>
  ),
};
