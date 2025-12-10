import type { Meta, StoryObj } from '@storybook/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from './card';
import { Button } from './button';
import { Badge } from './badge';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content area.</p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Create Wallet Report</CardTitle>
        <CardDescription>Report a stolen wallet to the registry.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Enter the compromised wallet address to begin the registration process.</p>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Continue</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Registration Status</CardTitle>
        <CardDescription>Your wallet registration is pending.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>Grace period ends in 3 minutes.</p>
      </CardContent>
    </Card>
  ),
};

export const RegistrationCard: Story = {
  name: 'Registration Flow Example',
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <CardTitle>Stolen Wallet Registry</CardTitle>
        <CardDescription>Register your compromised wallet to protect others.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Wallet Address</p>
          <p className="text-sm text-muted-foreground font-mono">
            0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Status</p>
          <Badge variant="secondary">Awaiting signature</Badge>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Sign Registration</Button>
      </CardFooter>
    </Card>
  ),
};

export const SimpleCard: Story = {
  name: 'Minimal Card',
  render: () => (
    <Card className="w-[300px]">
      <CardContent className="pt-6">
        <p className="text-center text-muted-foreground">No wallet connected</p>
      </CardContent>
    </Card>
  ),
};

export const CardGrid: Story = {
  name: 'Card Grid Layout',
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Total Registered</CardTitle>
          <CardDescription>Wallets in registry</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">1,234</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pending</CardTitle>
          <CardDescription>In grace period</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">56</p>
        </CardContent>
      </Card>
    </div>
  ),
};
