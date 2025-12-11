import type { Meta, StoryObj } from '@storybook/react';
import { TransactionCard } from './TransactionCard';

const meta: Meta<typeof TransactionCard> = {
  title: 'Composed/TransactionCard',
  component: TransactionCard,
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
type Story = StoryObj<typeof TransactionCard>;

const sampleHash =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;

/**
 * Ready to submit acknowledgement.
 */
export const ReadyToSubmit: Story = {
  args: {
    type: 'acknowledgement',
    status: 'idle',
    onSubmit: () => console.log('Submit clicked'),
  },
};

/**
 * Registration transaction ready.
 */
export const RegistrationType: Story = {
  args: {
    type: 'registration',
    status: 'idle',
    onSubmit: () => console.log('Submit clicked'),
  },
};

/**
 * Submitting to the network.
 */
export const Submitting: Story = {
  args: {
    type: 'acknowledgement',
    status: 'submitting',
    onSubmit: () => {},
  },
};

/**
 * Waiting for block confirmation.
 */
export const Pending: Story = {
  args: {
    type: 'acknowledgement',
    status: 'pending',
    hash: sampleHash,
    explorerUrl: 'https://etherscan.io/tx/' + sampleHash,
    onSubmit: () => {},
  },
};

/**
 * Transaction confirmed.
 */
export const Confirmed: Story = {
  args: {
    type: 'acknowledgement',
    status: 'confirmed',
    hash: sampleHash,
    explorerUrl: 'https://etherscan.io/tx/' + sampleHash,
    onSubmit: () => {},
  },
};

/**
 * Registration confirmed.
 */
export const RegistrationConfirmed: Story = {
  args: {
    type: 'registration',
    status: 'confirmed',
    hash: sampleHash,
    explorerUrl: 'https://etherscan.io/tx/' + sampleHash,
    onSubmit: () => {},
  },
};

/**
 * Transaction failed.
 */
export const Failed: Story = {
  args: {
    type: 'acknowledgement',
    status: 'failed',
    error: 'Transaction reverted: Insufficient gas',
    onSubmit: () => console.log('Submit clicked'),
    onRetry: () => console.log('Retry clicked'),
  },
};

/**
 * Failed with hash (reverted on-chain).
 */
export const FailedWithHash: Story = {
  args: {
    type: 'acknowledgement',
    status: 'failed',
    hash: sampleHash,
    explorerUrl: 'https://etherscan.io/tx/' + sampleHash,
    error: 'Transaction reverted: Signature expired',
    onSubmit: () => console.log('Submit clicked'),
    onRetry: () => console.log('Retry clicked'),
  },
};
