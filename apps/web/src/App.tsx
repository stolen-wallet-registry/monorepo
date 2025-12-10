import { AppProviders } from '@/providers';
import { Layout } from '@/components/layout';
import { WalletStatus } from '@/components/composed/WalletStatus';
import { DevTools } from '@/components/dev';

function App() {
  return (
    <AppProviders>
      <Layout>
        <WalletStatus />
      </Layout>
      <DevTools />
    </AppProviders>
  );
}

export default App;
