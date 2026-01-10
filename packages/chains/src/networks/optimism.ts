import type { SpokeNetworkConfig } from '../types';

/**
 * Optimism Mainnet - Production spoke chain.
 *
 * Bridges to Base mainnet hub.
 */
export const optimism: SpokeNetworkConfig = {
  chainId: 10,
  name: 'optimism',
  displayName: 'Optimism',
  networkLogoPath: '/icons/networks/optimism.svg',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['https://mainnet.optimism.io', 'https://opt-mainnet.g.alchemy.com/v2/demo'],

  explorer: {
    name: 'Optimism Explorer',
    url: 'https://optimistic.etherscan.io',
    apiUrl: 'https://api-optimistic.etherscan.io/api',
  },

  blockTiming: {
    blockTimeSeconds: 2,
    graceBlocks: 60, // ~2 min
    deadlineBlocks: 300, // ~10 min
  },

  role: 'spoke',
  hubChainId: 8453, // Base mainnet

  bridges: {
    primary: 'hyperlane',
    hyperlane: {
      mailbox: '0xd4C1905BB1D26BC93DAC913e13CaCC278CdCC80D',
      igp: '0xD8A76C4D91fCbB7Cc8eA795DFDF870E48368995C',
    },
  },

  // Fill after mainnet deployment
  spokeContracts: null,

  priceFeed: {
    chainlinkFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5', // ETH/USD on Optimism
  },

  isTestnet: false,
  isLocal: false,
};
