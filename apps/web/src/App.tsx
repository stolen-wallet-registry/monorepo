import { Route, Switch } from 'wouter';

import { AppProviders } from '@/providers';
import { Layout } from '@/components/layout';
import { DevTools } from '@/components/dev';
import { ErrorBoundary } from '@/components/composed/ErrorBoundary';
import { Toaster } from '@swr/ui';
import {
  HomePage,
  StandardRegistrationPage,
  SelfRelayRegistrationPage,
  P2PRoleSelectionPage,
  P2PRegistereeRegistrationPage,
  P2PRelayerRegistrationPage,
  NotFoundPage,
} from '@/pages';

function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <Layout>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/registration/standard" component={StandardRegistrationPage} />
            <Route path="/registration/self-relay" component={SelfRelayRegistrationPage} />
            <Route path="/registration/p2p-relay" component={P2PRoleSelectionPage} />
            <Route
              path="/registration/p2p-relay/registeree"
              component={P2PRegistereeRegistrationPage}
            />
            <Route path="/registration/p2p-relay/relayer" component={P2PRelayerRegistrationPage} />
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
