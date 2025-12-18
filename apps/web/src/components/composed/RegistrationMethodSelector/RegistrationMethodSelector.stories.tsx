import type { Meta, StoryObj } from '@storybook/react';
import { RegistrationMethodSelector } from './RegistrationMethodSelector';

const meta: Meta<typeof RegistrationMethodSelector> = {
  title: 'Composed/RegistrationMethodSelector',
  component: RegistrationMethodSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[900px] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    onSelect: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof RegistrationMethodSelector>;

/**
 * Default state with all methods available.
 */
export const Default: Story = {
  args: {
    p2pAvailable: true,
  },
};

/**
 * P2P relay disabled (no peer available).
 */
export const P2PDisabled: Story = {
  args: {
    p2pAvailable: false,
  },
};
