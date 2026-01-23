import type { SpokeNetworkConfig } from '../types';

/**
 * Arbitrum One - Production spoke chain.
 *
 * Bridges to Base mainnet hub.
 */
export const arbitrum: SpokeNetworkConfig = {
  chainId: 42161,
  name: 'arbitrum',
  displayName: 'Arbitrum',
  networkLogoPath: '/icons/networks/arbitrum.svg',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],

  explorer: {
    name: 'Arbiscan',
    url: 'https://arbiscan.io',
    apiUrl: 'https://api.arbiscan.io/api',
  },

  blockTiming: {
    blockTimeSeconds: 0.25, // Arbitrum has very fast block times
    graceBlocks: 480, // ~2 min
    deadlineBlocks: 2400, // ~10 min
  },

  role: 'spoke',
  hubChainId: 8453, // Base mainnet

  bridges: {
    primary: 'hyperlane',
    hyperlane: {
      mailbox: '0x979Ca5202784112f4738403dBec5D0F3B9daabB9',
      igp: '0x3b6044acd6767f017e99318AA6Ef93b7B06A5a22',
    },
  },

  // Fill after mainnet deployment
  spokeContracts: null,

  priceFeed: {
    chainlinkFeed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', // ETH/USD on Arbitrum
  },

  isTestnet: false,
  isLocal: false,
};
