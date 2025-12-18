import type { Meta, StoryObj } from '@storybook/react';
import { InfoTooltip } from './InfoTooltip';
import { TooltipProvider } from '@swr/ui';

const meta: Meta<typeof InfoTooltip> = {
  title: 'Composed/InfoTooltip',
  component: InfoTooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <div className="p-8">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof InfoTooltip>;

/**
 * Default info tooltip with simple text content.
 */
export const Default: Story = {
  args: {
    content: 'This is helpful information about the feature.',
  },
};

/**
 * Small size (default).
 */
export const SizeSmall: Story = {
  args: {
    content: 'Small info icon',
    size: 'sm',
  },
};

/**
 * Medium size.
 */
export const SizeMedium: Story = {
  args: {
    content: 'Medium info icon',
    size: 'md',
  },
};

/**
 * Tooltip on the right side.
 */
export const SideRight: Story = {
  args: {
    content: 'Tooltip appears on the right',
    side: 'right',
  },
};

/**
 * Tooltip on the bottom.
 */
export const SideBottom: Story = {
  args: {
    content: 'Tooltip appears below',
    side: 'bottom',
  },
};

/**
 * Tooltip with longer content.
 */
export const LongContent: Story = {
  args: {
    content:
      'This is a longer explanation that provides more detail about a feature. It wraps to multiple lines when necessary.',
  },
};

/**
 * Tooltip with JSX content.
 */
export const JSXContent: Story = {
  args: {
    content: (
      <div className="space-y-1">
        <p className="font-medium">Important Note</p>
        <p>This content uses JSX for richer formatting.</p>
      </div>
    ),
  },
};

/**
 * Used inline with text.
 */
export const InlineWithText: Story = {
  render: () => (
    <div className="flex items-center gap-1">
      <span>Protocol Fee</span>
      <InfoTooltip content="A small fee that supports the registry protocol." />
    </div>
  ),
};
