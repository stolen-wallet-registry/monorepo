import type { Meta, StoryObj } from '@storybook/react';
import { Wallet, FileText, FileCode } from 'lucide-react';
import { RegistryCard } from './RegistryCard';

const meta: Meta<typeof RegistryCard> = {
  title: 'Composed/RegistryCard',
  component: RegistryCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RegistryCard>;

/**
 * Active registry card - clickable.
 */
export const Active: Story = {
  args: {
    title: 'Stolen Wallet Registry',
    description:
      'Report a compromised wallet to prevent further unauthorized transactions and protect the ecosystem.',
    icon: <Wallet className="size-6" />,
    onClick: () => console.log('Card clicked'),
  },
};

/**
 * Badge variant for operator-only registry.
 */
export const OperatorOnly: Story = {
  args: {
    title: 'Fraudulent Contract Registry',
    description: 'Catalog malicious smart contracts and warn users before interaction.',
    icon: <FileCode className="size-6" />,
    badge: { label: 'Operators Only', variant: 'outline' },
    onClick: () => console.log('Card clicked'),
  },
};

/**
 * Grid layout with multiple cards.
 */
export const GridLayout: Story = {
  decorators: [
    (Story) => (
      <div className="grid w-[800px] grid-cols-3 gap-4 p-4">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      <RegistryCard
        title="Stolen Wallet"
        description="Report a compromised wallet to protect the ecosystem."
        icon={<Wallet className="size-6" />}
        onClick={() => console.log('Wallet clicked')}
      />
      <RegistryCard
        title="Stolen Transaction"
        description="Report specific fraudulent transactions."
        icon={<FileText className="size-6" />}
        onClick={() => console.log('Transaction clicked')}
      />
      <RegistryCard
        title="Fraudulent Contract"
        description="Catalog malicious smart contracts."
        icon={<FileCode className="size-6" />}
        badge={{ label: 'Operators Only', variant: 'outline' }}
        onClick={() => console.log('Contract clicked')}
      />
    </>
  ),
};
