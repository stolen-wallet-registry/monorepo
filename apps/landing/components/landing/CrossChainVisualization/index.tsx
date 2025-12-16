'use client';

import { Suspense, lazy } from 'react';

import { CrossChainVisualizationSkeleton } from './Skeleton';

import type { CrossChainVisualizationProps } from './types';

// Lazy load heavy visualization components for code splitting
const CrossChainVisualizationDesktop = lazy(() =>
  import('./Desktop').then((mod) => ({ default: mod.CrossChainVisualizationDesktop }))
);
const CrossChainVisualizationMobile = lazy(() =>
  import('./Mobile').then((mod) => ({ default: mod.CrossChainVisualizationMobile }))
);

// Main responsive visualization - shows desktop or mobile based on screen size
export function CrossChainVisualization(props: CrossChainVisualizationProps) {
  return (
    <>
      {/* Desktop: horizontal with animated beams (≥768px) */}
      <div className="hidden md:block">
        <CrossChainVisualizationDesktop {...props} />
      </div>
      {/* Mobile: vertical stacked layout (<768px) */}
      <div className="block md:hidden">
        <CrossChainVisualizationMobile {...props} />
      </div>
    </>
  );
}

// Wrapper with Suspense for lazy loading - skeleton shows while components load
export function CrossChainVisualizationWithSuspense(props: CrossChainVisualizationProps) {
  return (
    <Suspense fallback={<CrossChainVisualizationSkeleton className={props.className} />}>
      <CrossChainVisualization {...props} />
    </Suspense>
  );
}

// Re-export skeleton and types
export { CrossChainVisualizationSkeleton } from './Skeleton';
export type { CrossChainVisualizationProps } from './types';
