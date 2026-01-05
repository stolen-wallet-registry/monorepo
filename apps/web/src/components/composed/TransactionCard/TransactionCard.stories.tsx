import type { Meta, StoryObj } from '@storybook/react';
import { TransactionCard, type SignedMessageData } from './TransactionCard';
import type { Address, Hash, Hex } from '@/lib/types/ethereum';

const meta: Meta<typeof TransactionCard> = {
  title: 'Composed/TransactionCard',
  component: TransactionCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    // Disable controls for object with BigInt - Storybook can't serialize them
    signedMessage: { control: false },
  },
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

const sampleHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hash;

const sampleSignedMessage: SignedMessageData = {
  registeree: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address,
  forwarder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as Address,
  nonce: 0n,
  deadline: 12345678n,
  signature:
    '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8538dde03fc8b4c6d7f2c13c82e5c34d0e5f8b1c0b5e2f3a4b5c6d7e8f9a0b1c21b' as Hex,
};

/**
 * Ready to submit with signed message preview.
 */
export const ReadyToSubmit: Story = {
  args: {
    type: 'acknowledgement',
    status: 'idle',
    signedMessage: sampleSignedMessage,
    onSubmit: () => console.log('Submit clicked'),
  },
};

/**
 * Registration transaction ready with signed message.
 */
export const RegistrationType: Story = {
  args: {
    type: 'registration',
    status: 'idle',
    signedMessage: sampleSignedMessage,
    onSubmit: () => console.log('Submit clicked'),
  },
};

/**
 * Without signed message (legacy display).
 */
export const WithoutSignedMessage: Story = {
  args: {
    type: 'acknowledgement',
    status: 'idle',
    onSubmit: () => console.log('Submit clicked'),
  },
};

/**
 * Submitting to the network - button shows loading state.
 */
export const Submitting: Story = {
  args: {
    type: 'acknowledgement',
    status: 'submitting',
    signedMessage: sampleSignedMessage,
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

/**
 * Failed with long error message (tests overflow handling).
 */
export const FailedWithLongError: Story = {
  args: {
    type: 'acknowledgement',
    status: 'failed',
    error:
      'ContractFunctionExecutionError: The contract function "acknowledgementOfRegistry" reverted with the following reason: Signature verification failed - deadline has passed. Version: viem@2.41.2',
    onSubmit: () => console.log('Submit clicked'),
    onRetry: () => console.log('Retry clicked'),
  },
};
