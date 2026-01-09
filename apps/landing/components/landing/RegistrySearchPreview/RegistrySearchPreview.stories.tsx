import type { Meta, StoryObj } from '@storybook/react';
import { Search, Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import {
  Button,
  Input,
  Alert,
  AlertTitle,
  AlertDescription,
  type ResultStatus,
  getStatusLabel,
  getStatusDescription,
} from '@swr/ui';

import { RegistrySearchPreview } from './index';
import { EXAMPLE_REGISTERED_ADDRESS, EXAMPLE_CLEAN_ADDRESS } from './constants';

const meta = {
  title: 'Landing/RegistrySearchPreview',
  component: RegistrySearchPreview,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Search component for the landing page that allows visitors to query the registry without connecting a wallet.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RegistrySearchPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state - empty search input ready for user interaction.
 */
export const Default: Story = {};

/**
 * Helper component to show static result states for documentation.
 */
function StatusIcon({ status }: { status: ResultStatus }) {
  switch (status) {
    case 'registered':
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    case 'pending':
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case 'not-found':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
  }
}

function getAlertVariant(status: ResultStatus): 'destructive' | 'default' {
  if (status === 'registered') return 'destructive';
  return 'default';
}

/**
 * Static display of search results for documentation purposes.
 */
function ResultPreview({ status, address }: { status: ResultStatus; address: string }) {
  return (
    <div className="w-full max-w-md">
      {/* Static search form */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={address}
            readOnly
            placeholder="Search wallet address (0x...)"
            className="pl-10"
          />
        </div>
        <Button disabled>Search</Button>
      </div>

      {/* Example buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Try examples:</span>
        <Button variant="outline" size="sm" disabled className="text-xs">
          Stolen Wallet
        </Button>
        <Button variant="outline" size="sm" disabled className="text-xs">
          Clean Wallet
        </Button>
      </div>

      {/* Result display */}
      <Alert variant={getAlertVariant(status)} className="mt-4">
        <StatusIcon status={status} />
        <AlertTitle className="ml-2">{getStatusLabel(status)}</AlertTitle>
        <AlertDescription className="ml-2">
          <p className="mt-1">{getStatusDescription(status)}</p>
          <p className="mt-2 font-mono text-xs opacity-70">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Shows loading state while searching.
 */
function LoadingPreview() {
  const address = EXAMPLE_REGISTERED_ADDRESS;
  return (
    <div className="w-full max-w-md">
      {/* Search form with loading */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={address}
            readOnly
            placeholder="Search wallet address (0x...)"
            className="pl-10"
            disabled
          />
        </div>
        <Button disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      </div>

      {/* Example buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Try examples:</span>
        <Button variant="outline" size="sm" disabled className="text-xs">
          Stolen Wallet
        </Button>
        <Button variant="outline" size="sm" disabled className="text-xs">
          Clean Wallet
        </Button>
      </div>
    </div>
  );
}

/**
 * Loading state - shows spinner while querying the registry.
 */
export const Loading: Story = {
  render: () => <LoadingPreview />,
};

/**
 * Registered (stolen) wallet result.
 * This is the destructive/warning state shown when a wallet is found in the registry.
 */
export const RegisteredResult: Story = {
  render: () => <ResultPreview status="registered" address={EXAMPLE_REGISTERED_ADDRESS} />,
};

/**
 * Pending status - wallet has acknowledgement but registration not complete.
 */
export const PendingResult: Story = {
  render: () => (
    <ResultPreview status="pending" address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e" />
  ),
};

/**
 * Not found (clean) wallet result.
 * Shows success state when wallet is not in the registry.
 */
export const NotFoundResult: Story = {
  render: () => <ResultPreview status="not-found" address={EXAMPLE_CLEAN_ADDRESS} />,
};

/**
 * Interactive demo showing how the component works.
 * Note: This story makes actual network calls to the registry contract.
 */
export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Interactive demo that makes actual network calls. Try the example buttons to see real results from Base Sepolia testnet.',
      },
    },
  },
};
