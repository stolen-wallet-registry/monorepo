import type { SpokeNetworkConfig } from '../types';

export const ethereum: SpokeNetworkConfig = {
  chainId: 1,
  name: 'ethereum',
  displayName: 'Ethereum',
  networkLogoPath: '/icons/networks/ethereum.svg',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['https://eth.llamarpc.com', 'https://ethereum.publicnode.com'],

  explorer: {
    name: 'Etherscan',
    url: 'https://etherscan.io',
    apiUrl: 'https://api.etherscan.io/api',
  },

  blockTiming: {
    blockTimeSeconds: 12,
    graceBlocks: 10, // ~2 min
    deadlineBlocks: 50, // ~10 min
  },

  role: 'spoke',
  hubChainId: 8453, // Base mainnet

  bridges: {
    primary: 'hyperlane',
    hyperlane: {
      mailbox: '0xc005dc82818d67AF737725bD4bf75435d065D239',
      igp: '0x56f52c0A1ddcD557285f7CBc782D3d83096CE1Cc',
    },
  },

  // Fill after mainnet deployment
  spokeContracts: null,

  priceFeed: {
    chainlinkFeed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD on Ethereum
  },

  isTestnet: false,
  isLocal: false,
};
