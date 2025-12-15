import type { Meta, StoryObj } from '@storybook/react';

import { CrossChainVisualization } from './CrossChainVisualization';

const meta: Meta<typeof CrossChainVisualization> = {
  title: 'Landing/CrossChainVisualization',
  component: CrossChainVisualization,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
Interactive visualization showing how the Stolen Wallet Registry works across multiple blockchains.

**Left side - Networks reporting fraud:**
- Ethereum L1 with L2s (Optimism, Arbitrum, Polygon) clustered around it
- Alt L1s (Solana, BNB Chain) grouped together
- Bitcoin standalone

**Center - Registry:**
- Stolen Wallet Registry on Base (settlement layer)
- Smart contract icon + Base logo

**Right side - Consumers querying registry:**
- Exchanges cluster (Coinbase, Kraken, Gemini, Binance)
- Wallets cluster (MetaMask, Rainbow, Coinbase Wallet, Ledger)
- Green pulse effect when receiving fraud alerts

**Animation phases:**
1. Phase 1: Networks send stolen wallet reports → Registry
2. Phase 2: Registry broadcasts alerts → Exchanges & Wallets
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    showHeader: {
      description: 'Show title and description above the visualization',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    showLabels: {
      description: 'Show section labels (Report Fraud, Query Registry, cluster names)',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background p-8">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CrossChainVisualization>;

export const Default: Story = {
  args: {
    showHeader: true,
    showLabels: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Full visualization with header, description, and all labels.',
      },
    },
  },
};

export const NoHeader: Story = {
  args: {
    showHeader: false,
    showLabels: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Visualization without the title/description header. Useful when embedding in a section with its own header.',
      },
    },
  },
};

export const Minimal: Story = {
  args: {
    showHeader: false,
    showLabels: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Just the visualization with no text labels. Icons only.',
      },
    },
  },
};

export const DarkMode: Story = {
  args: {
    showHeader: true,
    showLabels: true,
  },
  decorators: [
    (Story) => (
      <div className="dark min-h-screen bg-zinc-950 p-8">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: 'Dark mode variant. The visualization adapts to the dark theme.',
      },
    },
  },
};
