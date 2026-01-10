import type { SpokeNetworkConfig } from '../types';

/**
 * Optimism Sepolia - Testnet spoke chain.
 *
 * Bridges to Base Sepolia hub.
 */
export const optimismSepolia: SpokeNetworkConfig = {
  chainId: 11155420,
  name: 'optimism-sepolia',
  displayName: 'Optimism Sepolia',
  networkLogoPath: '/icons/networks/optimism.svg',

  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['https://sepolia.optimism.io'],

  explorer: {
    name: 'Optimism Sepolia Explorer',
    url: 'https://sepolia-optimism.etherscan.io',
    apiUrl: 'https://api-sepolia-optimistic.etherscan.io/api',
  },

  blockTiming: {
    blockTimeSeconds: 2,
    graceBlocks: 60, // ~2 min
    deadlineBlocks: 300, // ~10 min
  },

  role: 'spoke',
  hubChainId: 84532, // Base Sepolia

  bridges: {
    primary: 'hyperlane',
    hyperlane: {
      mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039',
      igp: '0x28B02B97a850872C4D33C3E024fab6499ad96564',
    },
  },

  // Fill after deployment - null indicates not deployed
  spokeContracts: null,

  priceFeed: {
    chainlinkFeed: '0x61Ec26aA57019C486B10502285c5A3D4A4750AD7',
  },

  isTestnet: true,
  isLocal: false,
};
