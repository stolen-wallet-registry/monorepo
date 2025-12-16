import type { Meta, StoryObj } from '@storybook/react';

import { MethodsSection } from './MethodsSection';

const meta = {
  title: 'Landing/MethodsSection',
  component: MethodsSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof MethodsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
