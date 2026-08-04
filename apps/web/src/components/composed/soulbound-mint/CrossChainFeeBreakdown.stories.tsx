/**
 * What a user is shown before agreeing to spend money on a cross-chain mint.
 *
 * The failure modes are the interesting states: a fee quote that never arrives, a gas estimate
 * still loading under a fee that already resolved, and no ETH price (which suppresses every USD
 * column). Each changes what the total means, so each gets a story.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { TooltipProvider } from '@swr/ui';
import { CrossChainFeeBreakdown } from './CrossChainFeeBreakdown';

const FEE = { feeEth: '0.000142' };
const GAS = { gasCostEth: '0.000031', gasCostUsd: 0.09 };
const ETH_PRICE = 2800;

const meta: Meta<typeof CrossChainFeeBreakdown> = {
  title: 'Composed/SoulboundMint/CrossChainFeeBreakdown',
  component: CrossChainFeeBreakdown,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="w-96">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    crossChainFee: FEE,
    isLoadingFee: false,
    isFeeError: false,
    feeError: null,
    feeTooltip: 'Paid to the Hyperlane relayer to deliver your mint request to the hub chain.',
    gasEstimate: GAS,
    isLoadingGas: false,
    ethPrice: ETH_PRICE,
    currentChainName: 'Optimism Sepolia',
  },
};

export default meta;
type Story = StoryObj<typeof CrossChainFeeBreakdown>;

/** Wallet mint: bridge fee plus gas, no donation row. */
export const WalletMint: Story = {};

/** Support mint: the donation is a third row and is folded into the total. */
export const SupportMintWithDonation: Story = {
  args: { donationEth: '0.01' },
};

/** The fee quote is still in flight; nothing about cost is claimed yet. */
export const LoadingFee: Story = {
  args: { crossChainFee: null, isLoadingFee: true },
};

/**
 * The quote failed. The reason is surfaced rather than swallowed — a silent "unavailable" here
 * reads as "free" to someone skimming.
 */
export const FeeError: Story = {
  args: {
    crossChainFee: null,
    isFeeError: true,
    feeError: { message: 'Hyperlane quoteDispatch reverted' },
  },
};

/** Neither loading nor errored — the quote simply is not available on this chain. */
export const FeeUnavailable: Story = {
  args: { crossChainFee: null },
};

/** Fee resolved, gas still estimating. The total is deliberately incomplete rather than wrong. */
export const GasStillLoading: Story = {
  args: { gasEstimate: null, isLoadingGas: true },
};

/** Gas estimation failed outright: an em dash, not a zero. */
export const GasUnavailable: Story = {
  args: { gasEstimate: null },
};

/**
 * No ETH price. Every USD column disappears rather than rendering "$0.00", which would be a
 * false statement about cost.
 */
export const NoEthPrice: Story = {
  args: { ethPrice: 0, donationEth: '0.01' },
};

/** A donation large enough that the fee and gas rows are rounding noise beside it. */
export const LargeDonation: Story = {
  args: { donationEth: '2.5' },
};
