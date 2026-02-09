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
    stolenWalletRegistry: '0x80C139C37468DbffB2109cc337467c2887F7EA40',
    stolenTransactionRegistry: '0xbd41310C6CFe0Aec2Ddd017681417F0614618fC3',
    fraudulentContractRegistry: '0xDc89d5d4Fec4159fC9EEA7d471cdafEe88cDec0D',
    feeManager: '0xE14aa15D8d9a3f3FEb78563166E931284510d96C',
    registryHub: '0x396c850B9eC24a28e7556B7eb9C962F7bA836400',
    crossChainInbox: '0x2F3EA898e8d179dC21Bb6835428207335Cc3F72d',
    operatorRegistry: '0xB4F23F67DBbFa190415F3584A8fE8c1fF9BAeA35',
  },

  priceFeed: {
    chainlinkFeed: null, // Deploy mock
  },

  isTestnet: false,
  isLocal: true,
};
