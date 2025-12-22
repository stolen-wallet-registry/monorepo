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

/** Hub chain cross-chain contracts */
export const HUB_CROSSCHAIN_ADDRESSES = {
  mockMailbox: {
    [anvilHub.id]: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address,
  },
  crossChainInbox: {
    [anvilHub.id]: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' as Address,
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
  spokeRegistry: {
    [anvilSpoke.id]: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
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
