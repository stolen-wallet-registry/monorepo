/**
 * Build-time gates for the dev-only panels.
 *
 * `DevTools` and `P2PDebugPanel` each end with a runtime `if (import.meta.env.PROD) return null`,
 * which fires far too late to matter: the module and everything it pulls in (libp2p debug
 * helpers, the whole devtools tree) are already in the production bundle by the time any
 * component renders. Roughly a thousand lines plus transitive dependencies shipped to every
 * user for a panel none of them can open.
 *
 * The `import.meta.env.DEV ? lazy(() => import(...)) : null` shape moves the decision into the
 * build. Vite substitutes `false` for `import.meta.env.DEV` in a production build, Rollup then
 * drops the dead branch, and with the only `import()` gone the chunk is never emitted at all.
 * The panels keep their own runtime guards — this is a bundling fix, not a replacement for them.
 */

import { lazy, Suspense } from 'react';
import type { P2PDebugPanelProps } from './P2PDebugPanel';

const LazyDevTools = import.meta.env.DEV
  ? lazy(() => import('./DevTools').then((m) => ({ default: m.DevTools })))
  : null;

const LazyP2PDebugPanel = import.meta.env.DEV
  ? lazy(() => import('./P2PDebugPanel').then((m) => ({ default: m.P2PDebugPanel })))
  : null;

export function DevTools() {
  if (!LazyDevTools) return null;
  return (
    <Suspense fallback={null}>
      <LazyDevTools />
    </Suspense>
  );
}

export function P2PDebugPanel(props: P2PDebugPanelProps) {
  if (!LazyP2PDebugPanel) return null;
  return (
    <Suspense fallback={null}>
      <LazyP2PDebugPanel {...props} />
    </Suspense>
  );
}
