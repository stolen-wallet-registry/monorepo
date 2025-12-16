import type { Meta, StoryObj } from '@storybook/react';

import { HowItWorksSection } from './HowItWorksSection';

const meta = {
  title: 'Landing/HowItWorksSection',
  component: HowItWorksSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HowItWorksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
