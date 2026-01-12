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
    // Deterministic addresses from Anvil Account 0 deployer
    stolenWalletRegistry: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    feeManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    registryHub: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    crossChainInbox: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  },

  priceFeed: {
    chainlinkFeed: null, // Deploy mock
  },

  isTestnet: false,
  isLocal: true,
};
