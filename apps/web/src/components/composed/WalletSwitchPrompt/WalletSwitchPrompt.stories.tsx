import type { Meta, StoryObj } from '@storybook/react';
import { WalletSwitchPrompt } from './WalletSwitchPrompt';

const meta: Meta<typeof WalletSwitchPrompt> = {
  title: 'Composed/WalletSwitchPrompt',
  component: WalletSwitchPrompt,
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
type Story = StoryObj<typeof WalletSwitchPrompt>;

const stolenWallet = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
const gasWallet = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as `0x${string}`;

/**
 * Correct wallet connected.
 */
export const CorrectWallet: Story = {
  args: {
    currentAddress: stolenWallet,
    expectedAddress: stolenWallet,
    expectedLabel: 'Stolen Wallet',
  },
};

/**
 * Need to switch to stolen wallet (for registration signing step).
 */
export const NeedToSwitchToStolen: Story = {
  args: {
    currentAddress: gasWallet,
    expectedAddress: stolenWallet,
    expectedLabel: 'Stolen Wallet',
    currentLabel: 'Gas Wallet',
  },
};

/**
 * Need to switch to gas wallet (for payment step).
 */
export const NeedToSwitchToGas: Story = {
  args: {
    currentAddress: stolenWallet,
    expectedAddress: gasWallet,
    expectedLabel: 'Gas Wallet',
    currentLabel: 'Stolen Wallet',
  },
};

/**
 * Wallet disconnected.
 */
export const Disconnected: Story = {
  args: {
    currentAddress: null,
    expectedAddress: stolenWallet,
    expectedLabel: 'Stolen Wallet',
  },
};

/**
 * Wrong network connected.
 */
export const WrongNetwork: Story = {
  args: {
    currentAddress: stolenWallet,
    expectedAddress: stolenWallet,
    expectedLabel: 'Stolen Wallet',
    currentChainId: 1,
    expectedChainId: 8453,
  },
};

/**
 * Correct network connected.
 */
export const CorrectNetwork: Story = {
  args: {
    currentAddress: stolenWallet,
    expectedAddress: stolenWallet,
    expectedLabel: 'Stolen Wallet',
    currentChainId: 8453,
    expectedChainId: 8453,
  },
};
