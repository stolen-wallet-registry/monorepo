import type { Meta, StoryObj } from '@storybook/react';
import { Wallet, FileText, Code2 } from 'lucide-react';

import { RegistryCard } from './RegistryCard';

const meta = {
  title: 'Landing/RegistryCard',
  component: RegistryCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="w-[350px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RegistryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    title: 'Stolen Wallets',
    description:
      'Register wallets you no longer control. Self-attestation with wallet signature provides high trust signal.',
    status: 'active',
    icon: <Wallet className="size-6" />,
  },
};

export const ComingSoon: Story = {
  args: {
    title: 'Stolen Transactions',
    description:
      'Report specific fraudulent transactions like phishing attacks or address poisoning.',
    status: 'coming-soon',
    icon: <FileText className="size-6" />,
  },
};

export const FraudulentContracts: Story = {
  args: {
    title: 'Fraudulent Contracts',
    description: 'Catalog malicious smart contract addresses. Operator-approved submissions.',
    status: 'coming-soon',
    icon: <Code2 className="size-6" />,
  },
};
