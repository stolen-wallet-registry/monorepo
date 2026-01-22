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
    stolenTransactionRegistry: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    fraudulentContractRegistry: '0x59b670e9fA9D0A427751Af201D676719a970857b',
    feeManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    registryHub: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    crossChainInbox: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    operatorRegistry: '0x0B306BF915C4d645ff596e518fAf3F9669b97016',
  },

  priceFeed: {
    chainlinkFeed: null, // Deploy mock
  },

  isTestnet: false,
  isLocal: true,
};
