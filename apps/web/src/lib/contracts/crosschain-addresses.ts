/**
 * Cross-chain contract addresses.
 *
 * Local addresses come from `pnpm deploy:crosschain`.
 * Testnet/mainnet addresses added after deployment.
 *
 * IMPORTANT: These are deterministic addresses based on Account 0 nonces.
 * Hyperlane infrastructure is deployed by Account 9 (separate nonce space).
 */

import { zeroAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';
import {
  anvilHub,
  anvilSpoke,
  baseSepolia,
  optimismSepolia,
  isHubChain,
  isSpokeChain,
  getHubChainId,
} from '@swr/chains';

// Re-export chain role helpers for backward compatibility
export { isHubChain, isSpokeChain, getHubChainId };

// ═══════════════════════════════════════════════════════════════════════════
// HYPERLANE INFRASTRUCTURE (deployed by Account 9 via `hyperlane core deploy`)
// ═══════════════════════════════════════════════════════════════════════════
// These addresses come from .hyperlane/chains/*/addresses.yaml
// Pre-loaded in anvil state via `pnpm anvil:crosschain`
//
// Account 9: 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
// Private Key: 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
// ⚠️  PUBLIC Anvil test key - DO NOT use in production!
// See: https://book.getfoundry.sh/reference/anvil/
//
// Mailbox addresses will be populated after running Hyperlane setup.
// ═══════════════════════════════════════════════════════════════════════════

/** Hyperlane Mailbox addresses (from Hyperlane CLI deployment with Account 9) */
export const HYPERLANE_ADDRESSES = {
  mailbox: {
    // Local Anvil (deployed by Account 9 via `hyperlane core deploy`)
    [anvilHub.chainId]: '0x12975173B87F7595EE45dFFb2Ab812ECE596Bf84' as Address,
    [anvilSpoke.chainId]: '0x12975173B87F7595EE45dFFb2Ab812ECE596Bf84' as Address,
    // Testnet (official Hyperlane deployments - same on both chains via CREATE2)
    // Source: https://github.com/hyperlane-xyz/hyperlane-registry
    [baseSepolia.chainId]: '0x6966b0E55883d49BFB24539356a2f8A673E02039' as Address,
    [optimismSepolia.chainId]: '0x6966b0E55883d49BFB24539356a2f8A673E02039' as Address,
  },
  igp: {
    // Local Anvil (mock, not used)
    [anvilHub.chainId]: '0x0000000000000000000000000000000000000000' as Address,
    [anvilSpoke.chainId]: '0x0000000000000000000000000000000000000000' as Address,
    // Testnet (official Hyperlane InterchainGasPaymaster)
    [baseSepolia.chainId]: '0x28B02B97a850872C4D33C3E024fab6499ad96564' as Address,
    [optimismSepolia.chainId]: '0x28B02B97a850872C4D33C3E024fab6499ad96564' as Address,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HUB CHAIN CONTRACTS (31337) - Account 0 nonces
// ═══════════════════════════════════════════════════════════════════════════
// Deployed via `pnpm deploy:crosschain` using Account 0
//
// Nonce order:
//   0: MockAggregator       → 0x5FbDB2315678afecb367f032d93F642f64180aa3
//   1: FeeManager           → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
//   2: RegistryHub          → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
//   3: StolenWalletRegistry → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
//   4: (setRegistry tx)
//   5: CrossChainInbox      → 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
//   6: (setCrossChainInbox tx)
// ═══════════════════════════════════════════════════════════════════════════

/** Hub chain cross-chain contracts */
export const HUB_CROSSCHAIN_ADDRESSES = {
  crossChainInbox: {
    [anvilHub.chainId]: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SPOKE CHAIN CONTRACTS (31338) - Account 0 nonces
// ═══════════════════════════════════════════════════════════════════════════
// Deployed via `pnpm deploy:crosschain` using Account 0
//
// Nonce order:
//   0: MockGasPaymaster     → 0x5FbDB2315678afecb367f032d93F642f64180aa3
//   1: HyperlaneAdapter     → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
//   2: (setDomainSupport tx)
//   3: MockAggregator       → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
//   4: FeeManager           → 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
//   5: SpokeRegistry        → 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spoke chain contracts.
 *
 * NOTE: These are deployment-specific addresses. For runtime access, prefer
 * using the network configs from @swr/chains (e.g., anvilSpoke.spokeContracts).
 */
export const SPOKE_ADDRESSES = {
  mockGasPaymaster: {
    [anvilSpoke.chainId]: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address,
    // Optimism Sepolia uses real Hyperlane IGP, not mock
  },
  bridgeAdapters: {
    [anvilSpoke.chainId]: {
      hyperlane: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    },
    [optimismSepolia.chainId]: {
      hyperlane: '0x0000000000000000000000000000000000000000' as Address, // Fill after deployment
    },
  },
  feeManager: {
    [anvilSpoke.chainId]: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  spokeRegistry: {
    [anvilSpoke.chainId]: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Simple spoke address contracts (excludes bridgeAdapters which has different structure) */
type SimpleSpokeContract = Exclude<keyof typeof SPOKE_ADDRESSES, 'bridgeAdapters'>;

export function getSpokeAddress(contract: SimpleSpokeContract, chainId: number): Address {
  const addresses = SPOKE_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(
      `No ${contract} address configured for spoke chain ID ${chainId}. Deploy contracts first.`
    );
  }
  return address as Address;
}

/** Get bridge adapter address for a specific provider on a spoke chain */
export function getBridgeAdapterAddress(
  chainId: number,
  provider: 'hyperlane' | 'wormhole' | 'ccip' = 'hyperlane'
): Address {
  const chainAdapters =
    SPOKE_ADDRESSES.bridgeAdapters[chainId as keyof typeof SPOKE_ADDRESSES.bridgeAdapters];
  if (!chainAdapters) {
    throw new Error(`No bridge adapters configured for chain ID ${chainId}.`);
  }
  const address = chainAdapters[provider as keyof typeof chainAdapters];
  if (!address || address === zeroAddress) {
    throw new Error(
      `No ${provider} adapter configured for chain ID ${chainId}. Deploy adapter first.`
    );
  }
  return address as Address;
}

export function getSpokeRegistryAddress(chainId: number): Address | null {
  if (!isSpokeChain(chainId)) return null;
  return getSpokeAddress('spokeRegistry', chainId);
}

export function getHyperlaneMailbox(chainId: number): Address {
  const address = HYPERLANE_ADDRESSES.mailbox[chainId as keyof typeof HYPERLANE_ADDRESSES.mailbox];
  if (!address || address === zeroAddress) {
    throw new Error(
      `Hyperlane Mailbox not configured for chain ID ${chainId}. Run Hyperlane setup first.`
    );
  }
  return address;
}
