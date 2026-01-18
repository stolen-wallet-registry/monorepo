import { Route, Switch } from 'wouter';

import { AppProviders } from '@/providers';
import { Layout } from '@/components/layout';
import { DevTools } from '@/components/dev';
import { ErrorBoundary } from '@/components/composed/ErrorBoundary';
import { Toaster } from '@swr/ui';
import {
  RegistrySelectionPage,
  HomePage,
  SearchPage,
  StandardRegistrationPage,
  SelfRelayRegistrationPage,
  P2PRoleSelectionPage,
  P2PRegistereeRegistrationPage,
  P2PRelayerRegistrationPage,
  SoulboundPage,
  TransactionHomePage,
  TransactionStandardRegistrationPage,
  TransactionSelfRelayRegistrationPage,
  NotFoundPage,
} from '@/pages';

function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <Layout>
          <Switch>
            <Route path="/" component={RegistrySelectionPage} />
            {/* Wallet registration routes */}
            <Route path="/register/wallet" component={HomePage} />
            <Route path="/registration/wallet/standard" component={StandardRegistrationPage} />
            <Route path="/registration/wallet/self-relay" component={SelfRelayRegistrationPage} />
            <Route path="/registration/wallet/p2p-relay" component={P2PRoleSelectionPage} />
            <Route
              path="/registration/wallet/p2p-relay/registeree"
              component={P2PRegistereeRegistrationPage}
            />
            <Route
              path="/registration/wallet/p2p-relay/relayer"
              component={P2PRelayerRegistrationPage}
            />
            {/* Transaction registration routes */}
            <Route path="/register/transactions" component={TransactionHomePage} />
            <Route
              path="/registration/transactions/standard"
              component={TransactionStandardRegistrationPage}
            />
            <Route
              path="/registration/transactions/self-relay"
              component={TransactionSelfRelayRegistrationPage}
            />
            {/* Other routes */}
            <Route path="/search" component={SearchPage} />
            <Route path="/soulbound" component={SoulboundPage} />
            <Route component={NotFoundPage} />
          </Switch>
        </Layout>
        <DevTools />
        <Toaster />
      </AppProviders>
    </ErrorBoundary>
  );
}

export default App;
