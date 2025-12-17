import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertTitle, AlertDescription, Button } from '@swr/ui';
import { AlertTriangle, Clock, X } from 'lucide-react';

/**
 * Mock version of ConnectedWalletStatus for Storybook.
 * The actual component requires wagmi context.
 */
interface MockConnectedWalletStatusProps {
  status: 'registered' | 'pending' | 'clean';
  address: string;
}

function MockConnectedWalletStatus({ status, address }: MockConnectedWalletStatusProps) {
  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  if (status === 'clean') {
    return (
      <div className="text-sm text-muted-foreground italic p-4 border border-dashed rounded-md">
        No alert shown when wallet is clean
      </div>
    );
  }

  if (status === 'registered') {
    return (
      <Alert variant="destructive" className="relative">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Your connected wallet is registered as stolen</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            This wallet (<code className="text-xs">{truncatedAddress}</code>) has been registered as
            stolen. Consider disconnecting and using a different wallet.
          </p>
        </AlertDescription>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-6 w-6 p-0"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    );
  }

  // pending
  return (
    <Alert className="relative border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-900 dark:text-yellow-100">
      <Clock className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-900 dark:text-yellow-100">
        Your connected wallet has a pending registration
      </AlertTitle>
      <AlertDescription className="text-yellow-800 dark:text-yellow-200">
        <p>
          This wallet (<code className="text-xs">{truncatedAddress}</code>) has an acknowledgement
          pending. Registration may complete soon.
        </p>
      </AlertDescription>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900"
        aria-label="Dismiss alert"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}

/**
 * ConnectedWalletStatus displays a warning when the connected wallet is registered
 * as stolen or has a pending acknowledgement.
 *
 * Note: This story uses a mock component. The actual component requires wagmi context.
 */
const meta: Meta<typeof MockConnectedWalletStatus> = {
  title: 'Composed/ConnectedWalletStatus',
  component: MockConnectedWalletStatus,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['registered', 'pending', 'clean'],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MockConnectedWalletStatus>;

const sampleAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

/**
 * Wallet is registered as stolen.
 * Shows destructive alert with dismiss button.
 */
export const Registered: Story = {
  args: {
    status: 'registered',
    address: sampleAddress,
  },
};

/**
 * Wallet has a pending acknowledgement.
 * Shows warning alert with dismiss button.
 */
export const Pending: Story = {
  args: {
    status: 'pending',
    address: sampleAddress,
  },
};

/**
 * Wallet is clean - no alert shown.
 * The component returns null when wallet is not in registry.
 */
export const Clean: Story = {
  args: {
    status: 'clean',
    address: sampleAddress,
  },
};
