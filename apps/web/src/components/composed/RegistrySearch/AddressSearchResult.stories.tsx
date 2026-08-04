/**
 * The card an integrator reads to decide whether an address is safe.
 *
 * This replaces the deleted `RegistrySearch.stories.tsx`, which documented `RegistrySearchResult`
 * — a component that no longer exists (see the note in `index.ts`). The states worth seeing side
 * by side are the ones audit findings UI-8/UI-9 are about: a green "Clean" card and an amber
 * "Could Not Verify" card look nothing alike on purpose, because the difference between them is
 * the difference between "we checked" and "we could not check".
 *
 * `RegistrySearch` itself is not storyable — it drives live indexer queries through wagmi and
 * TanStack Query — so its two result cards are documented instead.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { AddressSearchResult } from './AddressSearchResult';
import type { AddressSearchData, WalletSearchData, ContractSearchData } from '@swr/search';
import type { Address, Hash } from '@/lib/types/ethereum';

const ADDRESS = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0' as Address;
const OPERATOR = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address;
const REGISTRATION_TX = `0x${'c3'.repeat(32)}` as Hash;

const WALLET: WalletSearchData = {
  address: ADDRESS.toLowerCase() as Address,
  caip10: `eip155:*:${ADDRESS.toLowerCase()}`,
  registeredAt: 1_770_000_000n,
  transactionHash: REGISTRATION_TX,
  isSponsored: false,
  reportedChainCAIP2: 'eip155:8453',
  reportedChainName: 'Base',
};

const CONTRACT: ContractSearchData = {
  contractAddress: ADDRESS,
  chains: [
    {
      caip2ChainId: 'eip155:8453',
      chainName: 'Base',
      numericChainId: 8453,
      batchId: '17',
      operator: OPERATOR,
      reportedAt: 1_770_100_000n,
    },
    {
      caip2ChainId: 'eip155:10',
      chainName: 'Optimism',
      numericChainId: 10,
      batchId: '18',
      operator: OPERATOR,
      reportedAt: 1_770_200_000n,
    },
  ],
};

function data(overrides: Partial<AddressSearchData> = {}): AddressSearchData {
  return { address: ADDRESS, wallet: null, contract: null, ...overrides };
}

const meta: Meta<typeof AddressSearchResult> = {
  title: 'Composed/RegistrySearch/AddressSearchResult',
  component: AddressSearchResult,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: { data: { control: false } },
  decorators: [
    (Story) => (
      <div className="w-[34rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AddressSearchResult>;

/**
 * Every registry answered and none of them holds this address.
 *
 * This is the only state entitled to read as clean, and it is only reachable with an empty
 * `unverified` — the type makes "nothing found, but a registry was unreachable" unrepresentable.
 */
export const Clean: Story = {
  args: { found: false, data: null },
};

/** Registered stolen. The registration transaction and reported chain are both shown. */
export const StolenWallet: Story = {
  args: {
    found: true,
    foundInWalletRegistry: true,
    foundInContractRegistry: false,
    data: data({ wallet: WALLET }),
  },
};

/** Registered by someone else paying the gas — a relayed or sponsored registration. */
export const StolenWalletSponsored: Story = {
  args: {
    found: true,
    foundInWalletRegistry: true,
    foundInContractRegistry: false,
    data: data({ wallet: { ...WALLET, isSponsored: true } }),
  },
};

/** Flagged by an approved operator as a fraudulent contract, on two chains. */
export const FraudulentContract: Story = {
  args: {
    found: true,
    foundInWalletRegistry: false,
    foundInContractRegistry: true,
    data: data({ contract: CONTRACT }),
  },
};

/** Both registries hold it. Neither hit is allowed to hide the other. */
export const InBothRegistries: Story = {
  args: {
    found: true,
    foundInWalletRegistry: true,
    foundInContractRegistry: true,
    data: data({ wallet: WALLET, contract: CONTRACT }),
  },
};

/**
 * A hit stands even when the other registry is down — it is actionable on its own — but the
 * gap is stated rather than quietly dropped.
 */
export const HitWithAnUnverifiedRegistry: Story = {
  args: {
    found: true,
    foundInWalletRegistry: true,
    foundInContractRegistry: false,
    data: data({ wallet: WALLET }),
    unverified: ['contract'],
  },
};

/**
 * Nothing found AND a registry could not be reached. This must never render as the green card
 * above: a green "Clean" over an unreachable registry is exactly how an off-ramp clears a wallet
 * that IS registered stolen (findings UI-8/UI-9). "Try again" is the right advice here because
 * the query was sent and failed.
 */
export const CouldNotVerifyUnreachable: Story = {
  args: {
    found: false,
    data: null,
    unverified: ['wallet', 'contract'],
    reason: 'unreachable',
  },
};

/**
 * Same card, different guidance. The registry has no form for this identifier, so nothing was
 * ever queried — telling this user to retry sends them debugging an indexer that answered fine.
 */
export const CouldNotVerifyUnsupported: Story = {
  args: {
    found: false,
    data: null,
    unverified: ['wallet'],
    reason: 'unsupported-identifier',
  },
};
