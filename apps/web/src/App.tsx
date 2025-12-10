import { AppProviders } from '@/providers';
import { Layout } from '@/components/layout';
import { WalletStatus } from '@/components/composed/WalletStatus';
import { DevTools } from '@/components/dev';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <AppProviders>
      <Layout>
        <WalletStatus />
      </Layout>
      <DevTools />
      <Toaster />
    </AppProviders>
  );
}

export default App;
