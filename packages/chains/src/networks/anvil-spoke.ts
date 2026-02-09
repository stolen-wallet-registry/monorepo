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
    // CREATE2 deterministic addresses from Deploy.s.sol
    spokeRegistry: '0xED040e67447bE891200Ea1C12e5FA8DA083770A0',
    feeManager: '0xC399A0a346b1c4f17cd719C73A09F48469ccd199',
    bridgeAdapters: {
      hyperlane: '0x85881002c84e036E83a5094E1b789a00858B0063',
    },
  },

  priceFeed: {
    chainlinkFeed: null, // Deploy mock
  },

  isTestnet: false,
  isLocal: true,
};
