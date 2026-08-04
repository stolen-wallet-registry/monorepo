// Dev panels are exported through their build-time gate, never directly — importing
// `./DevTools` or `./P2PDebugPanel` from app code puts them back in the production bundle.
// See `lazy.tsx`.
export { DevTools, P2PDebugPanel } from './lazy';
export type { P2PDebugPanelProps } from './P2PDebugPanel';
