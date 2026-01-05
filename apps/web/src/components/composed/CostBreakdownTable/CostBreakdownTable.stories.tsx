import type { Meta, StoryObj } from '@storybook/react';
import { CostBreakdownTable } from './CostBreakdownTable';
import type { TransactionCost } from '@/hooks/useTransactionCost';

const meta: Meta<typeof CostBreakdownTable> = {
  title: 'Composed/CostBreakdownTable',
  component: CostBreakdownTable,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    // Disable controls for objects with BigInt
    costEstimate: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CostBreakdownTable>;

/** Sample gas-only cost (acknowledgement step) */
const gasOnlyCost: TransactionCost = {
  protocolFee: null,
  bridgeFee: null,
  bridgeName: null,
  gasCost: {
    wei: 42000000000000n, // 0.000042 ETH
    eth: '0.000042',
    usd: '$0.15',
    gwei: '21',
  },
  total: {
    wei: 42000000000000n,
    eth: '0.000042',
    usd: '$0.15',
  },
  ethPriceUsd: '$3,500.00',
  isCrossChain: false,
};

/** Sample cost with protocol fee (registration step) */
const withProtocolFeeCost: TransactionCost = {
  protocolFee: {
    wei: 1666666666666666n,
    eth: '0.001667',
    usd: '$5.83',
  },
  bridgeFee: null,
  bridgeName: null,
  gasCost: {
    wei: 84000000000000n,
    eth: '0.000084',
    usd: '$0.29',
    gwei: '28',
  },
  total: {
    wei: 1750666666666666n,
    eth: '0.001751',
    usd: '$6.13',
  },
  ethPriceUsd: '$3,500.00',
  isCrossChain: false,
};

/** Sample cost with bridge fee (spoke chain registration) */
const withBridgeFeeCost: TransactionCost = {
  protocolFee: {
    wei: 1666666666666666n,
    eth: '0.001667',
    usd: '$5.83',
  },
  bridgeFee: {
    wei: 285714285714285n,
    eth: '0.000286',
    usd: '$1.00',
  },
  bridgeName: 'Hyperlane',
  gasCost: {
    wei: 126000000000000n,
    eth: '0.000126',
    usd: '$0.44',
    gwei: '35',
  },
  total: {
    wei: 2078380952380951n,
    eth: '0.002078',
    usd: '$7.27',
  },
  ethPriceUsd: '$3,500.00',
  isCrossChain: true,
};

/**
 * Gas-only cost (acknowledgement step).
 */
export const Default: Story = {
  args: {
    costEstimate: gasOnlyCost,
    onRefresh: () => console.log('Refresh clicked'),
  },
};

/**
 * With protocol fee (registration step on hub chain).
 */
export const WithProtocolFee: Story = {
  args: {
    costEstimate: withProtocolFeeCost,
    onRefresh: () => console.log('Refresh clicked'),
  },
};

/**
 * With bridge fee (spoke chain registration via Hyperlane).
 */
export const WithBridgeFee: Story = {
  args: {
    costEstimate: withBridgeFeeCost,
    onRefresh: () => console.log('Refresh clicked'),
  },
};

/**
 * Loading skeleton state.
 */
export const Loading: Story = {
  args: {
    costEstimate: null,
    isLoading: true,
  },
};

/**
 * Refresh cooldown active.
 */
export const Refreshing: Story = {
  args: {
    costEstimate: withProtocolFeeCost,
    isLoading: true,
    isRefreshCooldown: true,
    onRefresh: () => console.log('Refresh clicked'),
  },
};

/**
 * Error state - unable to estimate.
 */
export const Error: Story = {
  args: {
    costEstimate: null,
    isError: true,
  },
};
