import type { SpokeNetworkConfig } from '../types';

/**
 * Anvil Spoke - Local development spoke chain.
 *
 * Start with: pnpm anvil:crosschain (port 8546)
 */
export const anvilSpoke: SpokeNetworkConfig = {
  chainId: 31338,
  name: 'anvil-spoke',
  displayName: 'Anvil Spoke',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['http://127.0.0.1:8546'],

  explorer: {
    name: 'Local',
    url: '', // No explorer for local chains
  },

  blockTiming: {
    blockTimeSeconds: 13, // Match anvil --block-time setting
    graceBlocks: 2, // ~26s for fast local iteration
    deadlineBlocks: 12, // ~2.5 min deadline window
  },

  role: 'spoke',
  hubChainId: 31337, // Anvil Hub

  bridges: {
    primary: 'hyperlane',
    hyperlane: {
      mailbox: '0x12975173B87F7595EE45dFFb2Ab812ECE596Bf84',
      igp: '0x0000000000000000000000000000000000000000', // Mock, not used locally
    },
  },

  spokeContracts: {
    // Regular CREATE (deployer + nonce) addresses from Deploy.s.sol
    spokeRegistry: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    feeManager: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    bridgeAdapters: {
      hyperlane: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    },
  },

  priceFeed: {
    chainlinkFeed: null, // Deploy mock
  },

  isTestnet: false,
  isLocal: true,
};
