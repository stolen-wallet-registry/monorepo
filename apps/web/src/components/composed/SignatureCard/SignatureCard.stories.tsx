import type { Meta, StoryObj } from '@storybook/react';
import { SignatureCard } from './SignatureCard';

const meta: Meta<typeof SignatureCard> = {
  title: 'Composed/SignatureCard',
  component: SignatureCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    // Disable controls for object with BigInt - Storybook can't serialize them
    data: { control: false },
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
type Story = StoryObj<typeof SignatureCard>;

const sampleData = {
  registeree: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`,
  forwarder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0' as `0x${string}`,
  nonce: 0n,
  deadline: 12345678n,
};

const sampleSignature =
  '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8538dde03fc8b4c6d7f2c13c82e5c34d0e5f8b1c0b5e2f3a4b5c6d7e8f9a0b1c21b' as `0x${string}`;

/**
 * Ready to sign acknowledgement.
 */
export const ReadyToSign: Story = {
  args: {
    type: 'acknowledgement',
    data: sampleData,
    status: 'idle',
    onSign: () => console.log('Sign clicked'),
  },
};

/**
 * Registration signature (different type).
 */
export const RegistrationType: Story = {
  args: {
    type: 'registration',
    data: sampleData,
    status: 'idle',
    onSign: () => console.log('Sign clicked'),
  },
};

/**
 * Waiting for wallet signature.
 */
export const Signing: Story = {
  args: {
    type: 'acknowledgement',
    data: sampleData,
    status: 'signing',
    onSign: () => {},
  },
};

/**
 * Signature successful.
 */
export const Success: Story = {
  args: {
    type: 'acknowledgement',
    data: sampleData,
    status: 'success',
    signature: sampleSignature,
    onSign: () => {},
  },
};

/**
 * Registration signature successful.
 */
export const RegistrationSuccess: Story = {
  args: {
    type: 'registration',
    data: sampleData,
    status: 'success',
    signature: sampleSignature,
    onSign: () => {},
  },
};

/**
 * Signing error.
 */
export const Error: Story = {
  args: {
    type: 'acknowledgement',
    data: sampleData,
    status: 'error',
    error: 'User rejected the signature request',
    onSign: () => console.log('Sign clicked'),
    onRetry: () => console.log('Retry clicked'),
  },
};

/**
 * Error with long message.
 */
export const ErrorLongMessage: Story = {
  args: {
    type: 'acknowledgement',
    data: sampleData,
    status: 'error',
    error:
      'The signature request was rejected because the wallet connection was lost. Please reconnect your wallet and try again.',
    onSign: () => console.log('Sign clicked'),
    onRetry: () => console.log('Retry clicked'),
  },
};
