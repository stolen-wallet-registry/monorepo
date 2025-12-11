import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const RegistryOptions: Story = {
  name: 'Registry Use Case',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Checkbox id="nft" defaultChecked />
        <Label htmlFor="nft">Mint Soulbound NFT marking wallet as stolen</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="notify" />
        <Label htmlFor="notify">Notify connected exchanges</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="public" defaultChecked />
        <Label htmlFor="public">Make registration publicly visible</Label>
      </div>
    </div>
  ),
};
