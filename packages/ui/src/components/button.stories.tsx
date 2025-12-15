import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Button',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost',
  },
};

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Link',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
  },
};

export const AllVariantsGrid: Story = {
  name: 'All Variants Grid',
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid grid-cols-3 gap-6">
      <div className="space-y-3">
        <p className="text-sm font-medium mb-4">Sizes</p>
        <div className="flex flex-col gap-2 items-start">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium mb-4">Variants</p>
        <div className="flex flex-col gap-2 items-start">
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium mb-4">States</p>
        <div className="flex flex-col gap-2 items-start">
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled Outline
          </Button>
        </div>
      </div>
    </div>
  ),
};
