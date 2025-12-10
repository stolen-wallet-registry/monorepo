import { AppProviders } from '@/providers';
import { Layout } from '@/components/layout';
import { WalletStatus } from '@/components/composed/WalletStatus';

function App() {
  return (
    <AppProviders>
      <Layout>
        <WalletStatus />
      </Layout>
    </AppProviders>
  );
}

export default App;
