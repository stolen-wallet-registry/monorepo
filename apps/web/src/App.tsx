import { Web3Provider } from '@/providers/Web3Provider';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';

function WalletStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const prevConnected = useRef(isConnected);
  const prevChainId = useRef(chainId);

  // Log wallet connection changes
  useEffect(() => {
    if (isConnected && !prevConnected.current) {
      logger.wallet.info('Wallet connected', { address, chainId });
    } else if (!isConnected && prevConnected.current) {
      logger.wallet.info('Wallet disconnected');
    }
    prevConnected.current = isConnected;
  }, [isConnected, address, chainId]);

  // Log chain changes
  useEffect(() => {
    if (chainId !== prevChainId.current && prevChainId.current !== undefined) {
      logger.wallet.info('Chain changed', { from: prevChainId.current, to: chainId });
    }
    prevChainId.current = chainId;
  }, [chainId]);

  if (!isConnected) {
    return <p className="text-muted-foreground">Connect your wallet to get started.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-green-600 font-medium">Connected</p>
      <p className="text-sm font-mono break-all">Address: {address}</p>
      <p className="text-sm">Chain ID: {chainId}</p>
    </div>
  );
}

function App() {
  return (
    <Web3Provider>
      <div className="min-h-screen">
        <header className="flex justify-between items-center p-4 border-b">
          <h1 className="text-xl font-bold">Stolen Wallet Registry</h1>
          <ConnectButton />
        </header>
        <main className="p-8">
          <WalletStatus />
        </main>
      </div>
    </Web3Provider>
  );
}

export default App;
