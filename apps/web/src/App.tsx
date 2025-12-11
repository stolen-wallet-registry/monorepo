import { Route, Switch } from 'wouter';

import { AppProviders } from '@/providers';
import { Layout } from '@/components/layout';
import { DevTools } from '@/components/dev';
import { ErrorBoundary } from '@/components/composed/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import {
  HomePage,
  StandardRegistrationPage,
  SelfRelayRegistrationPage,
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
            {/* P2P routes will be added in Phase 1C */}
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
