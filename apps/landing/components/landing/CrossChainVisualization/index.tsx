'use client';

import { Suspense } from 'react';

import { CrossChainVisualizationDesktop } from './Desktop';
import { CrossChainVisualizationMobile } from './Mobile';
import { CrossChainVisualizationSkeleton } from './Skeleton';

import type { CrossChainVisualizationProps } from './types';

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

// Wrapper with Suspense for lazy loading
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
