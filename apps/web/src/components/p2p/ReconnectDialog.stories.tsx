import type { Meta, StoryObj } from '@storybook/react';
import { ReconnectDialog } from './ReconnectDialog';

const meta = {
  title: 'P2P/ReconnectDialog',
  component: ReconnectDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    // Mock callbacks - just log to console for demo
    onOpenChange: (open: boolean) => console.log('onOpenChange:', open),
    onReconnected: (peerId: string) => console.log('onReconnected:', peerId),
    onCancel: () => console.log('onCancel'),
    // Mock getLibp2p - returns null to prevent actual reconnection
    getLibp2p: () => null,
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the dialog is open',
    },
    partnerRole: {
      control: 'select',
      options: ['relayer', 'registeree'],
      description: 'Role of the partner peer',
    },
    currentPeerId: {
      control: 'text',
      description: 'Current partner peer ID',
    },
  },
} satisfies Meta<typeof ReconnectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const MOCK_PEER_ID = '12D3KooWRvkMUMqQbDKNEgqSvE4VfxB7A6bPfYPCLnj9gZGDhpKm';

/**
 * Default dialog for a relayer partner.
 * Shows "Retry Connection" mode by default when currentPeerId is provided.
 */
export const RelayerPartner: Story = {
  args: {
    open: true,
    partnerRole: 'relayer',
    currentPeerId: MOCK_PEER_ID,
  },
};

/**
 * Dialog for a registeree partner.
 */
export const RegistereePartner: Story = {
  args: {
    open: true,
    partnerRole: 'registeree',
    currentPeerId: MOCK_PEER_ID,
  },
};

/**
 * Dialog without a current peer ID.
 * "Retry Connection" button is disabled, forcing "New Peer ID" mode.
 */
export const NoPreviousPeer: Story = {
  args: {
    open: true,
    partnerRole: 'relayer',
    currentPeerId: null,
  },
};

/**
 * Dialog closed state (for testing open/close transitions).
 */
export const Closed: Story = {
  args: {
    open: false,
    partnerRole: 'relayer',
    currentPeerId: MOCK_PEER_ID,
  },
};
