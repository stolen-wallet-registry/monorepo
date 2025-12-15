import type { Meta, StoryObj } from '@storybook/react';
import { SignatureDetails, type SignatureDetailsData } from './SignatureDetails';

const meta: Meta<typeof SignatureDetails> = {
  title: 'Composed/SignatureDetails',
  component: SignatureDetails,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    data: {
      description: 'EIP-712 signature data to display',
    },
    className: {
      description: 'Additional CSS classes',
      control: 'text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SignatureDetails>;

const baseData: SignatureDetailsData = {
  registeree: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  forwarder: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
  nonce: BigInt(0),
  deadline: BigInt(1734567890),
  chainId: 1,
};

/**
 * Default view showing all signature details.
 */
export const Default: Story = {
  args: {
    data: baseData,
  },
};

/**
 * On Sepolia testnet (chain ID 11155111).
 */
export const Sepolia: Story = {
  args: {
    data: {
      ...baseData,
      chainId: 11155111,
    },
  },
};

/**
 * On Base mainnet (chain ID 8453).
 */
export const Base: Story = {
  args: {
    data: {
      ...baseData,
      chainId: 8453,
    },
  },
};

/**
 * On Anvil local development (chain ID 31337).
 */
export const Anvil: Story = {
  args: {
    data: {
      ...baseData,
      chainId: 31337,
    },
  },
};

/**
 * Self-relay case where registeree and forwarder are the same address.
 */
export const SelfRelay: Story = {
  args: {
    data: {
      ...baseData,
      forwarder: baseData.registeree,
    },
  },
};

/**
 * With higher nonce (indicates previous registrations).
 */
export const HighNonce: Story = {
  args: {
    data: {
      ...baseData,
      nonce: BigInt(42),
    },
  },
};

/**
 * With custom styling applied via className.
 */
export const CustomStyling: Story = {
  args: {
    data: baseData,
    className: 'border-2 border-primary',
  },
};
