/**
 * Cross-chain contract addresses.
 *
 * Local addresses come from `pnpm deploy:crosschain`.
 * Testnet/mainnet addresses added after deployment.
 */

import type { Address } from '@/lib/types/ethereum';
import { anvilHub, anvilSpoke } from '@/lib/wagmi';

// Re-export chain role helpers
export { isHubChain, isSpokeChain, getHubChainId } from '@/lib/chains/config';
import { isSpokeChain } from '@/lib/chains/config';

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════
// Hub cross-chain contracts (deployed AFTER core contracts):
//   5: MockMailbox       → 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
//   6: CrossChainInbox   → 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
//
// Spoke contracts:
//   0: MockMailbox       → 0x5FbDB2315678afecb367f032d93F642f64180aa3
//   1: MockGasPaymaster  → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
//   2: HyperlaneAdapter  → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
//   3: (setDomainSupport tx)
//   4: MockAggregator    → 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
//   5: FeeManager        → 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
//   6: SpokeRegistry     → 0x0165878A594ca255338adfa4d48449f69242Eb8F
// ═══════════════════════════════════════════════════════════════════════════

/** Hub chain cross-chain contracts (deployed after core) */
export const HUB_CROSSCHAIN_ADDRESSES = {
  mockMailbox: {
    [anvilHub.id]: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Address,
  },
  crossChainInbox: {
    [anvilHub.id]: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' as Address,
  },
} as const;

/** Spoke chain contracts */
export const SPOKE_ADDRESSES = {
  mockMailbox: {
    [anvilSpoke.id]: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address,
  },
  mockGasPaymaster: {
    [anvilSpoke.id]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
  },
  hyperlaneAdapter: {
    [anvilSpoke.id]: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
  },
  feeManager: {
    [anvilSpoke.id]: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
  },
  spokeRegistry: {
    [anvilSpoke.id]: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getSpokeAddress(contract: keyof typeof SPOKE_ADDRESSES, chainId: number): Address {
  const addresses = SPOKE_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address) {
    throw new Error(`No ${contract} address configured for spoke chain ID ${chainId}`);
  }
  return address;
}

export function getSpokeRegistryAddress(chainId: number): Address | null {
  if (!isSpokeChain(chainId)) return null;
  return getSpokeAddress('spokeRegistry', chainId);
}
