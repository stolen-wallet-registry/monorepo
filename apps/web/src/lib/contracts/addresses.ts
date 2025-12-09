import { localhost } from '@/lib/wagmi';
import { sepolia } from 'wagmi/chains';

// Contract addresses by chain ID
export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [localhost.id]: '0x5fbdb2315678afecb367f032d93f642f64180aa3', // Default Anvil deployment
  [sepolia.id]: '0x0000000000000000000000000000000000000000', // TODO: Update with deployed address
};

// Get contract address for a chain, with env override support
export function getContractAddress(chainId: number): `0x${string}` {
  // Check for env override first
  if (chainId === localhost.id && import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST) {
    return import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST as `0x${string}`;
  }
  if (chainId === sepolia.id && import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA) {
    return import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA as `0x${string}`;
  }

  const address = CONTRACT_ADDRESSES[chainId];
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new Error(`No contract address configured for chain ID ${chainId}`);
  }
  return address;
}
