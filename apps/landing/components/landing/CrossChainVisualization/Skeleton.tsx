'use client';

import { cn } from '@swr/ui';

// Skeleton placeholder for container groups
function SkeletonGroup({ width = 'w-40', height = 'h-24' }: { width?: string; height?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl border border-border/30 bg-muted/30', width, height)}
    />
  );
}

// Skeleton placeholder for circular icons
function SkeletonCircle({ size = 'size-10' }: { size?: string }) {
  return <div className={cn('animate-pulse rounded-full bg-muted/50', size)} />;
}

// Skeleton loading state for desktop visualization
export function CrossChainVisualizationSkeletonDesktop({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      {/* Header skeleton */}
      <div className="flex flex-col items-center gap-2">
        <div className="h-7 w-64 animate-pulse rounded bg-muted/50" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted/30" />
      </div>

      {/* Main visualization skeleton */}
      <div className="relative flex h-[500px] w-full max-w-[1200px] items-center justify-between px-2 md:h-[600px] md:px-4 lg:h-[650px]">
        {/* Left side - Networks */}
        <div className="flex w-44 flex-col items-center gap-3 md:w-52 lg:w-60">
          <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
          <SkeletonGroup width="w-full" height="h-36" />
          <SkeletonGroup width="w-full" height="h-20" />
          <SkeletonGroup width="w-full" height="h-20" />
          <SkeletonGroup width="w-20" height="h-16" />
        </div>

        {/* Middle - Bridges & Operators */}
        <div className="flex flex-col items-center gap-4">
          <SkeletonGroup width="w-16" height="h-44" />
          <SkeletonGroup width="w-36" height="h-16" />
        </div>

        {/* Center - Registry Hub */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-4 w-36 animate-pulse rounded bg-muted/40" />
          <SkeletonCircle size="size-20" />
        </div>

        {/* Right side - Consumers */}
        <div className="flex w-36 flex-col items-center gap-4 md:w-44 lg:w-48">
          <div className="h-4 w-24 animate-pulse rounded bg-muted/40" />
          <SkeletonGroup width="w-full" height="h-24" />
          <SkeletonGroup width="w-full" height="h-20" />
          <SkeletonGroup width="w-full" height="h-16" />
        </div>
      </div>
    </div>
  );
}

// Mobile skeleton
export function CrossChainVisualizationSkeletonMobile({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-4', className)}>
      {/* Header skeleton */}
      <div className="flex flex-col items-center gap-2">
        <div className="h-6 w-48 animate-pulse rounded bg-muted/50" />
        <div className="h-3 w-64 animate-pulse rounded bg-muted/30" />
      </div>

      {/* Networks skeleton */}
      <SkeletonGroup width="w-full" height="h-24" />
      <div className="h-5 w-5 animate-pulse rounded-full bg-muted/30" />

      {/* Messaging skeleton */}
      <SkeletonGroup width="w-full" height="h-20" />
      <div className="h-5 w-5 animate-pulse rounded-full bg-muted/30" />

      {/* Hub skeleton */}
      <SkeletonGroup width="w-full" height="h-28" />
      <div className="h-5 w-5 animate-pulse rounded-full bg-muted/30" />

      {/* Consumers skeleton */}
      <SkeletonGroup width="w-full" height="h-24" />
    </div>
  );
}

// Responsive skeleton
export function CrossChainVisualizationSkeleton({ className }: { className?: string }) {
  return (
    <>
      <div className="hidden md:block">
        <CrossChainVisualizationSkeletonDesktop className={className} />
      </div>
      <div className="block md:hidden">
        <CrossChainVisualizationSkeletonMobile className={className} />
      </div>
    </>
  );
}
