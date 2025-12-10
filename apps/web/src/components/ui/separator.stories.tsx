import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta = {
  title: 'UI/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  args: {
    orientation: 'horizontal',
    className: 'w-[300px] bg-foreground/20',
  },
  decorators: [
    (Story) => (
      <div className="p-4 bg-card border rounded-md">
        <p className="text-sm mb-2">Content above</p>
        <Story />
        <p className="text-sm mt-2">Content below</p>
      </div>
    ),
  ],
};

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
  render: () => (
    <div className="flex items-center gap-4 p-4 bg-card border rounded-md h-16">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" className="bg-foreground/20" />
      <span className="text-sm">Right</span>
    </div>
  ),
};

export const WithText: Story = {
  render: () => (
    <div className="w-[300px]">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Stolen Wallet Registry</h4>
        <p className="text-sm text-muted-foreground">Cross-chain fraud detection</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Wallets</div>
        <Separator orientation="vertical" />
        <div>Transactions</div>
        <Separator orientation="vertical" />
        <div>Contracts</div>
      </div>
    </div>
  ),
};

export const FormSections: Story = {
  name: 'Form Section Divider',
  render: () => (
    <div className="w-[400px] space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Wallet Information</h3>
        <p className="text-sm text-muted-foreground">Enter the compromised wallet details</p>
      </div>

      <div className="space-y-2">
        <div className="h-10 rounded border bg-muted/30" />
        <div className="h-10 rounded border bg-muted/30" />
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold">Registration Options</h3>
        <p className="text-sm text-muted-foreground">Configure your registration</p>
      </div>

      <div className="space-y-2">
        <div className="h-10 rounded border bg-muted/30" />
        <div className="h-10 rounded border bg-muted/30" />
      </div>

      <Separator />

      <div className="flex justify-end gap-2">
        <div className="h-10 w-24 rounded bg-muted/30" />
        <div className="h-10 w-24 rounded bg-primary/30" />
      </div>
    </div>
  ),
};

export const RegistryTabs: Story = {
  name: 'Registry Navigation',
  render: () => (
    <div className="flex items-center space-x-4 text-sm">
      <span className="font-medium">Wallet Registry</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="text-muted-foreground">Transaction Registry</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="text-muted-foreground">Contract Registry</span>
    </div>
  ),
};
