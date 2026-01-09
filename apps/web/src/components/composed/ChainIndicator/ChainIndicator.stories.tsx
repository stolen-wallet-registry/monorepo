import type { Meta, StoryObj } from '@storybook/react';
import { ChainIndicator } from './ChainIndicator';

const meta = {
  title: 'Composed/ChainIndicator',
  component: ChainIndicator,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Badge showing the current chain (Hub/Spoke) for cross-chain development. ' +
          'Only visible when VITE_CROSSCHAIN=true or when forceShow is set.',
      },
    },
  },
  argTypes: {
    forceShow: {
      description: 'Force show the indicator even when not in cross-chain mode',
      control: 'boolean',
    },
    className: {
      description: 'Additional CSS classes',
      control: 'text',
    },
  },
} satisfies Meta<typeof ChainIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state - shows not connected since no wallet is connected in Storybook.
 * Use forceShow to see the indicator even when not in cross-chain mode.
 */
export const Default: Story = {
  args: {
    forceShow: true,
  },
};

/**
 * With custom styling applied.
 */
export const WithCustomClass: Story = {
  args: {
    forceShow: true,
    className: 'text-lg',
  },
};
