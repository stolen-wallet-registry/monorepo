/**
 * useWalletType - Detect if connected wallet is EOA or Smart Contract (Safe multisig)
 *
 * Uses getBytecode to determine wallet type:
 * - EOA: Returns undefined (no bytecode at address)
 * - Smart Contract (Safe): Returns hex bytecode string
 */

import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';

export type WalletType = 'eoa' | 'contract' | 'unknown';

export interface UseWalletTypeResult {
  /** The detected wallet type */
  walletType: WalletType;
  /** True while detecting wallet type */
  isLoading: boolean;
  /** True if wallet is a smart contract (Safe multisig) */
  isContract: boolean;
  /** True if wallet is an EOA (externally owned account) */
  isEOA: boolean;
}

/**
 * Detect if the connected wallet is an EOA or Smart Contract.
 *
 * @example
 * ```tsx
 * const { walletType, isEOA, isContract, isLoading } = useWalletType();
 *
 * if (isLoading) return <Spinner />;
 *
 * if (isEOA) {
 *   // Execute transaction directly
 * } else if (isContract) {
 *   // Generate calldata for Safe Transaction Builder
 * }
 * ```
 */
export function useWalletType(): UseWalletTypeResult {
  const { address } = useAccount();
  const client = usePublicClient();

  const { data, isLoading } = useQuery({
    queryKey: ['walletType', address],
    queryFn: async (): Promise<WalletType> => {
      if (!client || !address) return 'unknown';

      try {
        const bytecode = await client.getBytecode({ address });
        // EOA has no bytecode (undefined or '0x')
        // Smart contracts have bytecode (hex string with content)
        return bytecode && bytecode !== '0x' ? 'contract' : 'eoa';
      } catch {
        // On error (e.g., network issue), return unknown
        return 'unknown';
      }
    },
    enabled: !!address && !!client,
    staleTime: Infinity, // Wallet type doesn't change
    gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
  });

  const walletType = data ?? 'unknown';

  return {
    walletType,
    isLoading: isLoading && !!address,
    isContract: walletType === 'contract',
    isEOA: walletType === 'eoa',
  };
}
