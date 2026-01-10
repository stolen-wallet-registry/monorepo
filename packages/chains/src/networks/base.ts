import type { HubNetworkConfig } from '../types';

/**
 * Base Mainnet - Production hub chain.
 *
 * Primary settlement chain for production deployments.
 */
export const base: HubNetworkConfig = {
  chainId: 8453,
  name: 'base',
  displayName: 'Base',
  networkLogoPath: '/icons/networks/base.svg',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['https://mainnet.base.org'],

  explorer: {
    name: 'Basescan',
    url: 'https://basescan.org',
    apiUrl: 'https://api.basescan.org/api',
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
      mailbox: '0xeA87ae93Fa0019a82A727bfd3eBd1cFCa8f64f1D',
      igp: '0xc3F23848Ed2e04C0c6d41bd7804fa8f89F940B94',
    },
  },

  // Fill after mainnet deployment
  hubContracts: null,

  priceFeed: {
    chainlinkFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // ETH/USD on Base
  },

  isTestnet: false,
  isLocal: false,
};
