import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { AddressInput } from './AddressInput';

const meta = {
  title: 'Composed/AddressInput',
  component: AddressInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddressInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty input - no validation state shown.
 */
export const Empty: Story = {
  args: {
    placeholder: '0x...',
  },
};

/**
 * Valid Ethereum address.
 */
export const ValidEthereum: Story = {
  args: {
    value: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    addressType: 'ethereum',
  },
};

/**
 * Invalid Ethereum address - shows warning icon.
 */
export const InvalidEthereum: Story = {
  args: {
    value: '0x123invalid',
    addressType: 'ethereum',
  },
};

/**
 * Partial address - validates as user types.
 */
export const PartialAddress: Story = {
  args: {
    value: '0x7099797',
    addressType: 'ethereum',
  },
};

/**
 * Valid Solana address (basic validation).
 */
export const ValidSolana: Story = {
  args: {
    value: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    addressType: 'solana',
  },
};

/**
 * Valid Bitcoin address (P2PKH).
 */
export const ValidBitcoinP2PKH: Story = {
  args: {
    value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    addressType: 'bitcoin',
  },
};

/**
 * Valid Bitcoin address (Bech32).
 */
export const ValidBitcoinBech32: Story = {
  args: {
    value: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    addressType: 'bitcoin',
  },
};

/**
 * Auto-detect address type based on format.
 */
export const AutoDetect: Story = {
  args: {
    value: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    addressType: 'auto',
  },
};

/**
 * Without validation icons.
 */
export const NoValidationIcons: Story = {
  args: {
    value: '0x123invalid',
    showValidation: false,
  },
};

/**
 * Read-only with valid address.
 */
export const ReadOnly: Story = {
  args: {
    value: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    readOnly: true,
    className: 'bg-muted',
  },
};

/**
 * Interactive example showing real-time validation.
 */
export const Interactive: Story = {
  render: function InteractiveAddressInput() {
    const [value, setValue] = useState('');
    return (
      <div className="space-y-2">
        <AddressInput
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          placeholder="Enter an Ethereum address..."
        />
        <p className="text-sm text-muted-foreground">
          Try: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
        </p>
      </div>
    );
  },
};
