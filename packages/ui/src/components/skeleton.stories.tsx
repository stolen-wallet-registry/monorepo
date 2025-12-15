import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';
import { Card, CardContent, CardHeader } from './card';

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: 'h-4 w-[200px]',
  },
};

export const Circle: Story = {
  args: {
    className: 'h-12 w-12 rounded-full',
  },
};

export const TextLines: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-[250px]" />
      <Skeleton className="h-4 w-[200px]" />
      <Skeleton className="h-4 w-[180px]" />
    </div>
  ),
};

export const CardSkeleton: Story = {
  name: 'Card Loading State',
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <Skeleton className="h-6 w-[150px]" />
        <Skeleton className="h-4 w-[200px]" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  ),
};

export const WalletAddressSkeleton: Story = {
  name: 'Wallet Address Loading',
  render: () => (
    <div className="flex items-center gap-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-[120px]" />
        <Skeleton className="h-3 w-[180px]" />
      </div>
    </div>
  ),
};

export const RegistrationStepSkeleton: Story = {
  name: 'Registration Step Loading',
  render: () => (
    <div className="flex flex-col gap-4 w-[400px]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-5 w-[150px]" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2 mt-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  ),
};

export const TableRowSkeleton: Story = {
  name: 'Table Row Loading',
  render: () => (
    <div className="flex flex-col gap-2 w-[500px]">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 p-2 border rounded">
          <Skeleton className="h-4 w-[180px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-6 w-[80px]" />
        </div>
      ))}
    </div>
  ),
};
