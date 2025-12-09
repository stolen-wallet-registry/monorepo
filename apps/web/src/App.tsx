import { Web3Provider } from '@/providers/Web3Provider';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';

function WalletStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

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
