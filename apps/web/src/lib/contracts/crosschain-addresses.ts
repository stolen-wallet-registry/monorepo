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
    [anvilHub.chainId]: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' as Address,
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
//   0: MockGasPaymaster           → 0x5FbDB2315678afecb367f032d93F642f64180aa3
//   1: HyperlaneAdapter           → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
//   2: (setDomainSupport tx)
//   3: MockAggregator             → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
//   4: FeeManager                 → 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
//   5: SpokeRegistry              → 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
//   6: SpokeTransactionRegistry   → 0x0165878A594ca255338adfa4d48449f69242Eb8F
//   7: SpokeSoulboundForwarder    → 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
//   8: Multicall3                 → 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// V2 SPOKE CHAIN CONTRACTS (SpokeRegistryV2)
// ═══════════════════════════════════════════════════════════════════════════
// From `pnpm deploy:crosschain:v2` output

export const V2_SPOKE_ADDRESSES = {
  spokeRegistryV2: {
    [anvilSpoke.chainId]: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address, // TBD
  },
  hyperlaneAdapter: {
    [anvilSpoke.chainId]: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  spokeFeeManager: {
    [anvilSpoke.chainId]: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  spokeSoulboundForwarder: {
    [anvilSpoke.chainId]: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

export type V2SpokeContractName = keyof typeof V2_SPOKE_ADDRESSES;

/** Get V2 spoke contract address */
export function getSpokeV2Address(contract: V2SpokeContractName, chainId: number): Address {
  const addresses = V2_SPOKE_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(
      `No ${contract} address configured for spoke chain ID ${chainId}. Deploy V2 contracts first.`
    );
  }
  return address as Address;
}

/** Get SpokeRegistryV2 address */
export function getSpokeRegistryV2Address(chainId: number): Address {
  return getSpokeV2Address('spokeRegistryV2', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// V1 SPOKE CHAIN CONTRACTS (DEPRECATED - kept for transition)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use V2_SPOKE_ADDRESSES for new integrations.
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
  spokeTransactionRegistry: {
    [anvilSpoke.chainId]: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
  /** SpokeSoulboundForwarder for cross-chain soulbound minting */
  spokeSoulboundForwarder: {
    [anvilSpoke.chainId]: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' as Address,
    [optimismSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HUB SOULBOUND RECEIVER
// ═══════════════════════════════════════════════════════════════════════════

/** SoulboundReceiver on hub chain for cross-chain minting */
export const HUB_SOULBOUND_RECEIVER = {
  [anvilHub.chainId]: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82' as Address,
  [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
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

export function getSpokeTransactionRegistryAddress(chainId: number): Address | null {
  if (!isSpokeChain(chainId)) return null;
  return getSpokeAddress('spokeTransactionRegistry', chainId);
}

export function getSpokeSoulboundForwarderAddress(chainId: number): Address | null {
  if (!isSpokeChain(chainId)) return null;
  try {
    return getSpokeAddress('spokeSoulboundForwarder', chainId);
  } catch {
    return null;
  }
}

export function getSoulboundReceiverAddress(chainId: number): Address | null {
  if (!isHubChain(chainId)) return null;
  const address = HUB_SOULBOUND_RECEIVER[chainId as keyof typeof HUB_SOULBOUND_RECEIVER];
  if (!address || address === zeroAddress) {
    return null;
  }
  return address;
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
