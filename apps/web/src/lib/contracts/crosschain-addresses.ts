/**
 * Cross-chain contract addresses.
 *
 * Local addresses come from `pnpm deploy:crosschain`.
 * Testnet/mainnet addresses added after deployment.
 *
 * IMPORTANT: Local addresses use regular CREATE (deployer + nonce) from Deploy.s.sol.
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
// HUB CHAIN CONTRACTS (31337) - Regular CREATE (deployer + nonce)
// ═══════════════════════════════════════════════════════════════════════════
// Deployed via `pnpm deploy:crosschain` using Account 0

/** Hub chain cross-chain contracts */
export const HUB_CROSSCHAIN_ADDRESSES = {
  crossChainInbox: {
    [anvilHub.chainId]: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Address,
    // Base Sepolia (testnet hub) - fill after deployment
    [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SPOKE CHAIN CONTRACTS (31338) - Regular CREATE (deployer + nonce)
// ═══════════════════════════════════════════════════════════════════════════
// Deployed via `pnpm deploy:crosschain` using Account 0

// ═══════════════════════════════════════════════════════════════════════════
// SPOKE CHAIN CONTRACTS (SpokeRegistry)
// ═══════════════════════════════════════════════════════════════════════════
// From `pnpm deploy:crosschain` output

export const SPOKE_CONTRACT_ADDRESSES = {
  spokeRegistry: {
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

export type SpokeContractName = keyof typeof SPOKE_CONTRACT_ADDRESSES;

/** Get spoke contract address */
export function getSpokeContractAddress(contract: SpokeContractName, chainId: number): Address {
  const addresses = SPOKE_CONTRACT_ADDRESSES[contract];
  const address = addresses[chainId as keyof typeof addresses];
  if (!address || address === zeroAddress) {
    throw new Error(
      `No ${contract} address configured for spoke chain ID ${chainId}. Deploy contracts first.`
    );
  }
  return address as Address;
}

/** Get SpokeRegistry address */
export function getSpokeRegistryContractAddress(chainId: number): Address {
  return getSpokeContractAddress('spokeRegistry', chainId);
}

// ═══════════════════════════════════════════════════════════════════════════
// HUB SOULBOUND RECEIVER
// ═══════════════════════════════════════════════════════════════════════════

/** SoulboundReceiver on hub chain for cross-chain minting */
export const HUB_SOULBOUND_RECEIVER = {
  [anvilHub.chainId]: '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1' as Address,
  [baseSepolia.chainId]: '0x0000000000000000000000000000000000000000' as Address,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getSpokeSoulboundForwarderAddress(chainId: number): Address | null {
  if (!isSpokeChain(chainId)) return null;
  try {
    return getSpokeContractAddress('spokeSoulboundForwarder', chainId);
  } catch {
    return null;
  }
}

export function getBridgeAdapterAddress(chainId: number): Address {
  if (!isSpokeChain(chainId)) {
    throw new Error(`getBridgeAdapterAddress called with non-spoke chain ID ${chainId}`);
  }
  return getSpokeContractAddress('hyperlaneAdapter', chainId);
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
