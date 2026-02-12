import type { Meta, StoryObj } from '@storybook/react';
import { RegistrySearchResult } from './RegistrySearchResult';
import type { Address } from '@/lib/types/ethereum';

/**
 * RegistrySearchResult displays the status of a searched wallet address.
 *
 * Three states:
 * - **Registered**: Wallet is in the stolen registry (red/destructive)
 * - **Pending**: Acknowledgement submitted, awaiting registration (yellow/warning)
 * - **Not Found**: Wallet is clean, not in registry (green/success)
 *
 * Note: The full RegistrySearch component requires wagmi context and is best tested
 * with the actual app or E2E tests. This story focuses on the result display component.
 */
const meta: Meta<typeof RegistrySearchResult> = {
  title: 'Composed/RegistrySearch',
  component: RegistrySearchResult,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RegistrySearchResult>;

const sampleAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address;
const sampleForwarder = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as Address;

// Mock registration data for stories
const mockRegistrationData = {
  reportedChainId: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
  sourceChainId: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
  messageId: '0x0000000000000000000000000000000000000000000000000000000000000000' as const,
  registeredAt: 12345678n,
  incidentTimestamp: 0n,
  bridgeId: 0,
  isSponsored: false,
};

/**
 * Wallet is registered as stolen.
 * Shows destructive styling with registration details.
 */
export const Registered: Story = {
  args: {
    address: sampleAddress,
    status: 'registered',
    registrationData: mockRegistrationData,
  },
};

/**
 * Wallet is registered with sponsored registration.
 */
export const RegisteredSponsored: Story = {
  args: {
    address: sampleAddress,
    status: 'registered',
    registrationData: { ...mockRegistrationData, isSponsored: true },
  },
};

/**
 * Wallet has a pending acknowledgement.
 * Shows warning styling with acknowledgement details.
 */
export const Pending: Story = {
  args: {
    address: sampleAddress,
    status: 'pending',
    acknowledgementData: {
      trustedForwarder: sampleForwarder,
      startBlock: 12345000n,
      expiryBlock: 12345100n,
    },
  },
};

/**
 * Wallet is not in the registry.
 * Shows success styling indicating the wallet is clean.
 */
export const NotFound: Story = {
  args: {
    address: sampleAddress,
    status: 'not-found',
  },
};

/**
 * Registered without detailed data.
 * Minimal display when only boolean status is known.
 */
export const RegisteredMinimal: Story = {
  args: {
    address: sampleAddress,
    status: 'registered',
    registrationData: null,
  },
};

/**
 * Pending without detailed data.
 * Minimal display when only boolean status is known.
 */
export const PendingMinimal: Story = {
  args: {
    address: sampleAddress,
    status: 'pending',
    acknowledgementData: null,
  },
};
