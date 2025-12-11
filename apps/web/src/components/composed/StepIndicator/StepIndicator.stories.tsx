import type { Meta, StoryObj } from '@storybook/react';
import { StepIndicator } from './StepIndicator';

const meta: Meta<typeof StepIndicator> = {
  title: 'Composed/StepIndicator',
  component: StepIndicator,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-72 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StepIndicator>;

/**
 * Standard registration flow at step 1.
 */
export const StandardFlowStart: Story = {
  args: {
    registrationType: 'standard',
    currentStep: 'acknowledge-and-sign',
  },
};

/**
 * Standard registration flow at grace period.
 */
export const StandardFlowMidway: Story = {
  args: {
    registrationType: 'standard',
    currentStep: 'grace-period',
  },
};

/**
 * Standard registration flow complete.
 */
export const StandardFlowComplete: Story = {
  args: {
    registrationType: 'standard',
    currentStep: 'success',
  },
};

/**
 * Self-relay registration flow.
 */
export const SelfRelayFlow: Story = {
  args: {
    registrationType: 'selfRelay',
    currentStep: 'switch-and-pay-one',
  },
};

/**
 * P2P relay registration flow (more steps).
 */
export const P2PRelayFlow: Story = {
  args: {
    registrationType: 'p2pRelay',
    currentStep: 'acknowledgement-payment',
  },
};

/**
 * P2P relay flow at grace period.
 */
export const P2PRelayMidway: Story = {
  args: {
    registrationType: 'p2pRelay',
    currentStep: 'grace-period',
  },
};

/**
 * No current step (initial state).
 */
export const NoCurrentStep: Story = {
  args: {
    registrationType: 'standard',
    currentStep: null,
  },
};

/**
 * Custom step descriptions.
 */
export const WithDescriptions: Story = {
  args: {
    registrationType: 'standard',
    currentStep: 'grace-period',
    stepDescriptions: {
      'acknowledge-and-sign': 'Sign with your wallet to prove ownership',
      'acknowledge-and-pay': 'Submit the transaction to the blockchain',
      'grace-period': 'Wait ~5 minutes for anti-gaming protection',
      'register-and-sign': 'Sign the final registration message',
      'register-and-pay': 'Submit the registration transaction',
      success: 'Your wallet has been registered',
    },
  },
};

/**
 * Custom labels.
 */
export const CustomLabels: Story = {
  args: {
    registrationType: 'standard',
    currentStep: 'acknowledge-and-pay',
    stepLabels: {
      'acknowledge-and-sign': 'Step 1: Sign',
      'acknowledge-and-pay': 'Step 2: Pay',
      'grace-period': 'Step 3: Wait',
      'register-and-sign': 'Step 4: Sign Again',
      'register-and-pay': 'Step 5: Final Payment',
      success: 'Done!',
    },
  },
};
