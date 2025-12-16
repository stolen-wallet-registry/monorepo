import type { Meta, StoryObj } from '@storybook/react';

import { RegistriesSection } from './RegistriesSection';

const meta = {
  title: 'Landing/RegistriesSection',
  component: RegistriesSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof RegistriesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
