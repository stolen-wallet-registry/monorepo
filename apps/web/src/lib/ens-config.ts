/**
 * Separate wagmi config for ENS resolution only.
 *
 * ENS requires mainnet, but mainnet should NOT appear in RainbowKit's
 * chain selector. By isolating it in its own config and passing it
 * explicitly to ENS hooks, the main app config stays L2-only.
 */

import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';

/** Whether ENS resolution is enabled (default: true, set VITE_ENS_ENABLED=false to disable) */
export const isEnsEnabled = import.meta.env.VITE_ENS_ENABLED !== 'false';

function getMainnetRpcUrl(): string {
  if (import.meta.env.VITE_MAINNET_RPC_URL) return import.meta.env.VITE_MAINNET_RPC_URL;
  if (import.meta.env.VITE_ALCHEMY_API_KEY)
    return `https://eth-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`;
  return 'https://eth.llamarpc.com';
}

export const ensConfig = isEnsEnabled
  ? createConfig({
      chains: [mainnet],
      transports: { [mainnet.id]: http(getMainnetRpcUrl()) },
    })
  : null;
