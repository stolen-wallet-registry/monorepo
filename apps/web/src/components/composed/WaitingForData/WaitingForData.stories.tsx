import type { Meta, StoryObj } from '@storybook/react';
import { WaitingForData } from '@/components/p2p';

const meta: Meta<typeof WaitingForData> = {
  title: 'Composed/WaitingForData',
  component: WaitingForData,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4 border rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WaitingForData>;

/**
 * Default state with no props.
 */
export const Default: Story = {
  args: {},
};

/**
 * Custom message for specific context.
 */
export const CustomMessage: Story = {
  args: {
    message: 'Waiting for relayer response...',
  },
};

/**
 * With debug label showing what data is expected.
 */
export const WithDebugLabel: Story = {
  args: {
    message: 'Processing peer connection...',
    waitingFor: 'acknowledgement_signature',
  },
};

/**
 * Registeree waiting for relayer to submit acknowledgement transaction.
 */
export const AckPaymentWaiting: Story = {
  args: {
    message: 'Waiting for relayer to submit acknowledgement transaction...',
    waitingFor: 'acknowledgement transaction',
  },
};

/**
 * Registeree waiting for relayer to complete registration.
 */
export const RegPaymentWaiting: Story = {
  args: {
    message: 'Waiting for relayer to complete registration...',
    waitingFor: 'registration transaction',
  },
};

/**
 * Relayer waiting for registeree signature.
 */
export const WaitingForSignature: Story = {
  args: {
    message: 'Waiting for registeree to sign acknowledgement...',
    waitingFor: 'acknowledgement signature',
  },
};
