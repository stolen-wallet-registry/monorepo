/**
 * What a user sees between paying on a spoke chain and the token appearing on the hub.
 *
 * The three outcomes are not equally obvious, which is why they all get stories: polling looks
 * like nothing is happening, timeout is deliberately NOT a failure claim (the mint may still
 * land, hence the explorer link), and confirmed is the only state that shows the token. The
 * messageId can also be permanently absent — the log may be missing from the receipt — so a
 * story without the Hyperlane link exists too.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { Heart, ShieldCheck } from 'lucide-react';
import { CrossChainMintStatusCard } from './CrossChainMintStatusCard';
import type { Hash } from '@/lib/types/ethereum';

const SPOKE_HASH = `0x${'a1'.repeat(32)}` as Hash;
const MESSAGE_ID = `0x${'b2'.repeat(32)}` as Hash;
const HYPERLANE_URL = 'https://explorer.hyperlane.xyz/message/0xb2b2';

/** Stand-in for the real token art, which needs contract reads the story cannot make. */
function TokenPlaceholder() {
  return (
    <div className="flex h-32 w-32 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">
      token #42
    </div>
  );
}

const meta: Meta<typeof CrossChainMintStatusCard> = {
  title: 'Composed/SoulboundMint/CrossChainMintStatusCard',
  component: CrossChainMintStatusCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
  args: {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Minting your attestation',
    isConfirmedOnHub: false,
    isPolling: true,
    isTimeout: false,
    elapsedSeconds: 24,
    successMessage: 'Your attestation token has been minted on Base.',
    pendingMessage: 'Your request is on its way to Base.',
    spokeChainName: 'Optimism Sepolia',
    spokeHash: SPOKE_HASH,
    spokeExplorerHref: 'https://sepolia-optimism.etherscan.io/tx/0xa1a1',
    messageId: MESSAGE_ID,
    explorerUrl: HYPERLANE_URL,
    footerNote: 'Cross-chain delivery usually takes one to two minutes.',
    resetLabel: 'Done',
    onReset: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof CrossChainMintStatusCard>;

/** The common case: message dispatched, hub not yet reporting the token. */
export const Polling: Story = {};

/**
 * Immediately after dispatch, before the messageId has been pulled out of the receipt. The
 * Hyperlane link is absent rather than broken.
 */
export const NoMessageIdYet: Story = {
  args: { elapsedSeconds: 2, messageId: null, explorerUrl: null },
};

/** Hub confirmed. The only state that shows the token. */
export const Confirmed: Story = {
  args: {
    isConfirmedOnHub: true,
    isPolling: false,
    tokenDisplay: <TokenPlaceholder />,
  },
};

/**
 * Gave up waiting. Deliberately NOT phrased as a failure: the mint may still land, so the copy
 * points at the explorer instead of claiming an outcome the app cannot know.
 */
export const Timeout: Story = {
  args: { isPolling: false, isTimeout: true, elapsedSeconds: 180 },
};

/** A local chain with no block explorer — `ExplorerLink` degrades to plain text. */
export const NoExplorerForChain: Story = {
  args: {
    spokeChainName: 'Anvil',
    spokeExplorerHref: null,
    messageId: null,
    explorerUrl: null,
  },
};

/** The support-mint variant: same structure, different icon and wording. */
export const SupportMint: Story = {
  args: {
    icon: <Heart className="h-5 w-5" />,
    title: 'Minting your supporter token',
    successMessage: 'Thank you — your supporter token has been minted on Base.',
    pendingMessage: 'Your donation is on its way to Base.',
    isConfirmedOnHub: true,
    isPolling: false,
    tokenDisplay: <TokenPlaceholder />,
    resetLabel: 'Make another donation',
  },
};
