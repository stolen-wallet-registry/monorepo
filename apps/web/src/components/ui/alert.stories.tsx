import type { Meta, StoryObj } from '@storybook/react';
import { AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from './alert';

const meta = {
  title: 'UI/Alert',
  component: Alert,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args}>
      <Info className="h-4 w-4" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>This is an informational alert message.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: { variant: 'destructive' },
  render: (args) => (
    <Alert {...args}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Something went wrong. Please try again.</AlertDescription>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
    </Alert>
  ),
};

export const AllVariants: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Default Alert</AlertTitle>
        <AlertDescription>Default styling for general information.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Destructive Alert</AlertTitle>
        <AlertDescription>Used for errors and critical warnings.</AlertDescription>
      </Alert>
    </div>
  ),
};

export const RegistrationAlerts: Story = {
  name: 'Registration Flow Examples',
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-4 w-full max-w-md">
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Acknowledgement Received</AlertTitle>
        <AlertDescription>
          Your wallet has been acknowledged. Please wait for the grace period to complete.
        </AlertDescription>
      </Alert>
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Grace Period Active</AlertTitle>
        <AlertDescription>
          Registration will be available in approximately 3 minutes.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Registration Failed</AlertTitle>
        <AlertDescription>
          The signature was invalid or the deadline has passed. Please try again.
        </AlertDescription>
      </Alert>
    </div>
  ),
};
