import type { Meta, StoryObj } from '@storybook/react';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Button } from './button';

const meta = {
  title: 'Primitives/Toaster',
  component: Toaster,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
Toast notifications using Sonner. Supports success, error, warning, info, and loading states.

**Usage:**
\`\`\`typescript
import { toast } from 'sonner';

toast.success('Success message');
toast.error('Error message');
toast.warning('Warning message');
toast.info('Info message');
toast.loading('Loading...');
\`\`\`
        `,
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="min-h-[400px] bg-background p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTypes: Story = {
  name: 'All Toast Types',
  render: () => (
    <>
      <Toaster />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground mb-4">
          Click the buttons below to trigger different toast types. Toasts appear in the
          bottom-right corner.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => toast.success('Success! Operation completed successfully.')}
          >
            Success
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => toast.error('Error! Something went wrong.')}
          >
            Error
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.warning('Warning! Please check your input.')}
          >
            Warning
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast.info('Info: Here is some helpful information.')}
          >
            Info
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toast.loading('Loading... Please wait.')}
          >
            Loading
          </Button>
        </div>
      </div>
    </>
  ),
};

export const WithDescriptions: Story = {
  name: 'With Descriptions',
  render: () => (
    <>
      <Toaster />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground mb-4">
          Toasts can include both a title and description.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              toast.success('Wallet Registered', {
                description: 'Your wallet has been successfully added to the registry.',
              })
            }
          >
            With Description
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              toast.error('Registration Failed', {
                description: 'The signature was invalid. Please try again.',
              })
            }
          >
            Error with Description
          </Button>
        </div>
      </div>
    </>
  ),
};

export const WithActions: Story = {
  name: 'With Action Buttons',
  render: () => (
    <>
      <Toaster />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground mb-4">
          Toasts can include action buttons for user interaction.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              toast('Registration pending', {
                description: 'Would you like to continue?',
                action: {
                  label: 'Continue',
                  onClick: () => toast.success('Continued!'),
                },
              })
            }
          >
            With Action
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast('Undo available', {
                description: 'You can undo this action within 5 seconds.',
                action: {
                  label: 'Undo',
                  onClick: () => toast.info('Action undone'),
                },
                duration: 5000,
              })
            }
          >
            With Undo
          </Button>
        </div>
      </div>
    </>
  ),
};

export const PromiseToast: Story = {
  name: 'Promise Toast',
  render: () => {
    const simulateAsync = () =>
      new Promise<{ name: string }>((resolve) =>
        setTimeout(() => resolve({ name: 'Wallet Registration' }), 2000)
      );

    return (
      <>
        <Toaster />
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            Promise toasts automatically update based on promise state.
          </p>
          <Button
            size="sm"
            onClick={() =>
              toast.promise(simulateAsync(), {
                loading: 'Processing registration...',
                success: (data) => `${data.name} completed!`,
                error: 'Failed to register',
              })
            }
          >
            Promise Toast
          </Button>
        </div>
      </>
    );
  },
};

export const Positions: Story = {
  name: 'Default Position',
  render: () => (
    <>
      <Toaster position="bottom-right" />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground mb-4">
          By default, toasts appear in the bottom-right corner. The position can be configured on
          the Toaster component.
        </p>
        <Button size="sm" onClick={() => toast.info('This appears in the bottom-right corner')}>
          Show Toast
        </Button>
      </div>
    </>
  ),
};
