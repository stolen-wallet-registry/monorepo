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
    // Disable controls for data since BigInt can't be serialized by Storybook
    data: {
      description: 'EIP-712 signature data to display',
      control: false,
    },
    className: {
      description: 'Additional CSS classes',
      control: 'text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof SignatureDetails>;

/** Helper to create signature data with BigInt values */
const createData = (
  overrides?: Partial<Omit<SignatureDetailsData, 'nonce' | 'deadline'>> & {
    nonce?: number;
    deadline?: number;
  }
): SignatureDetailsData => ({
  registeree: overrides?.registeree ?? '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  trustedForwarder: overrides?.trustedForwarder ?? '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
  nonce: BigInt(overrides?.nonce ?? 0),
  deadline: BigInt(overrides?.deadline ?? 1734567890),
  chainId: overrides?.chainId ?? 1,
});

/**
 * Default view showing all signature details.
 */
export const Default: Story = {
  render: () => <SignatureDetails data={createData()} />,
};

/**
 * On Base Sepolia testnet (chain ID 84532).
 */
export const BaseSepolia: Story = {
  render: () => <SignatureDetails data={createData({ chainId: 84532 })} />,
};

/**
 * On Base mainnet (chain ID 8453).
 */
export const Base: Story = {
  render: () => <SignatureDetails data={createData({ chainId: 8453 })} />,
};

/**
 * On Anvil local development (chain ID 31337).
 */
export const Anvil: Story = {
  render: () => <SignatureDetails data={createData({ chainId: 31337 })} />,
};

/**
 * Self-relay case where registeree and trusted forwarder are the same address.
 */
export const SelfRelay: Story = {
  render: () => {
    const registeree = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
    return <SignatureDetails data={createData({ registeree, trustedForwarder: registeree })} />;
  },
};

/**
 * With higher nonce (indicates previous registrations).
 */
export const HighNonce: Story = {
  render: () => <SignatureDetails data={createData({ nonce: 42 })} />,
};

/**
 * With custom styling applied via className.
 */
export const CustomStyling: Story = {
  render: () => <SignatureDetails data={createData()} className="border-2 border-primary" />,
};

/**
 * With very large nonce value (edge case).
 */
export const LargeNonce: Story = {
  render: () => <SignatureDetails data={createData({ nonce: 999999999 })} />,
};

/**
 * Future deadline (valid, not expired).
 */
export const FutureDeadline: Story = {
  render: () => <SignatureDetails data={createData({ deadline: 2000000000 })} />,
};

/**
 * Past deadline (expired signature scenario).
 */
export const PastDeadline: Story = {
  render: () => <SignatureDetails data={createData({ deadline: 1000000 })} />,
};
