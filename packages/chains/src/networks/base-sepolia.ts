import type { HubNetworkConfig } from '../types';

/**
 * Base Sepolia - Testnet hub chain.
 *
 * Settlement chain for testnet deployments.
 */
export const baseSepolia: HubNetworkConfig = {
  chainId: 84532,
  name: 'base-sepolia',
  displayName: 'Base Sepolia',
  networkLogoPath: '/icons/networks/base.svg',

  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia.g.alchemy.com/v2/demo'],

  explorer: {
    name: 'Basescan Sepolia',
    url: 'https://sepolia.basescan.org',
    apiUrl: 'https://api-sepolia.basescan.org/api',
  },

  blockTiming: {
    blockTimeSeconds: 2,
    graceBlocks: 60, // ~2 min
    deadlineBlocks: 300, // ~10 min
  },

  role: 'hub',

  bridges: {
    primary: 'hyperlane',
    hyperlane: {
      mailbox: '0x6966b0E55883d49BFB24539356a2f8A673E02039',
      igp: '0x28B02B97a850872C4D33C3E024fab6499ad96564',
    },
    // Future: Add wormhole, ccip configs when supported
  },

  // Fill after deployment - zero addresses indicate not deployed
  hubContracts: null,

  priceFeed: {
    chainlinkFeed: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  },

  isTestnet: true,
  isLocal: false,
};
