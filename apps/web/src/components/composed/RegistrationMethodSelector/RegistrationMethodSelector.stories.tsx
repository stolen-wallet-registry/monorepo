import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RegistrationMethodSelector } from './RegistrationMethodSelector';
import type { RegistrationType } from '@/stores/registrationStore';

const meta: Meta<typeof RegistrationMethodSelector> = {
  title: 'Composed/RegistrationMethodSelector',
  component: RegistrationMethodSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[900px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RegistrationMethodSelector>;

/**
 * Default state with no selection.
 */
export const Default: Story = {
  args: {
    selected: null,
    onSelect: () => {},
    p2pAvailable: true,
  },
};

/**
 * Standard method selected.
 */
export const StandardSelected: Story = {
  args: {
    selected: 'standard',
    onSelect: () => {},
    p2pAvailable: true,
  },
};

/**
 * Self-relay method selected.
 */
export const SelfRelaySelected: Story = {
  args: {
    selected: 'selfRelay',
    onSelect: () => {},
    p2pAvailable: true,
  },
};

/**
 * P2P relay method selected.
 */
export const P2PSelected: Story = {
  args: {
    selected: 'p2pRelay',
    onSelect: () => {},
    p2pAvailable: true,
  },
};

/**
 * P2P relay disabled (no peer available).
 */
export const P2PDisabled: Story = {
  args: {
    selected: null,
    onSelect: () => {},
    p2pAvailable: false,
  },
};

/**
 * Interactive example wrapper component.
 */
function InteractiveSelector({ p2pAvailable }: { p2pAvailable: boolean }) {
  const [selected, setSelected] = useState<RegistrationType | null>(null);
  return (
    <RegistrationMethodSelector
      selected={selected}
      onSelect={setSelected}
      p2pAvailable={p2pAvailable}
    />
  );
}

/**
 * Interactive example with state.
 */
export const Interactive: Story = {
  render: () => <InteractiveSelector p2pAvailable={true} />,
};

/**
 * Interactive with P2P disabled.
 */
export const InteractiveP2PDisabled: Story = {
  render: () => <InteractiveSelector p2pAvailable={false} />,
};
