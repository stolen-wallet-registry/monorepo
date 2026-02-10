import type { HubNetworkConfig } from '../types';

/**
 * Anvil Hub - Local development hub chain.
 *
 * Start with: pnpm anvil (port 8545)
 */
export const anvilHub: HubNetworkConfig = {
  chainId: 31337,
  name: 'anvil-hub',
  displayName: 'Anvil Hub',

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  rpcUrls: ['http://127.0.0.1:8545'],

  explorer: {
    name: 'Local',
    url: '', // No explorer for local chains
  },

  blockTiming: {
    blockTimeSeconds: 13, // Match anvil --block-time setting
    graceBlocks: 2, // ~26s for fast local iteration
    deadlineBlocks: 12, // ~2.5 min deadline window
  },

  role: 'hub',

  // Hub chains receive messages, don't initiate - no bridge config needed
  bridges: undefined,

  hubContracts: {
    // CREATE2 deterministic addresses from Deploy.s.sol
    stolenWalletRegistry: '0x62C4B01F3a7f0c239fcE6FE7d63e1c39526820A5',
    stolenTransactionRegistry: '0x1D1C79d846B6411a6fb37a4D709C481a3390eAa7',
    fraudulentContractRegistry: '0x93264320fa69Bacc011ce517C31719D0bB94C18c',
    feeManager: '0xE14aa15D8d9a3f3FEb78563166E931284510d96C',
    registryHub: '0xf6FcdE2a63E1B9208eB5947a9Ab1dcb6E9e174d5',
    crossChainInbox: '0x44F3A2cDa6251B4189d516D6876F4cDdBec1299a',
    operatorRegistry: '0xB4F23F67DBbFa190415F3584A8fE8c1fF9BAeA35',
  },

  priceFeed: {
    chainlinkFeed: null, // Deploy mock
  },

  isTestnet: false,
  isLocal: true,
};
