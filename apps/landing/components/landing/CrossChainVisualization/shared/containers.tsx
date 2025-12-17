'use client';

import React, { forwardRef } from 'react';
import { Info } from 'lucide-react';
import { cn, NetworkBase, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';

import { Caip10Emission } from './emission';

// Reusable info icon with tooltip - reduces duplication across components
const InfoTooltip = ({
  content,
  ariaLabel,
  iconSize = 'size-3',
}: {
  content: string;
  ariaLabel: string;
  iconSize?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Info
          className={cn(
            'cursor-help text-muted-foreground/60 transition-colors hover:text-foreground',
            iconSize
          )}
        />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs">
      <p className="text-sm">{content}</p>
    </TooltipContent>
  </Tooltip>
);

// Section title with info icon tooltip for explanations
export const SectionTitle = ({
  title,
  tooltip,
  className,
}: {
  title: string;
  tooltip: string;
  className?: string;
}) => (
  <div className={cn('flex items-center gap-1', className)}>
    <span className="text-xs font-medium text-muted-foreground">{title}</span>
    <InfoTooltip content={tooltip} ariaLabel={`Info about ${title}`} />
  </div>
);

// Grouping container with light border and edge anchors for beams
export const GroupContainer = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children: React.ReactNode;
    label?: string;
    labelTooltip?: string;
    leftAnchorRef?: React.RefObject<HTMLDivElement | null>;
    rightAnchorRef?: React.RefObject<HTMLDivElement | null>;
    topAnchorRef?: React.RefObject<HTMLDivElement | null>;
    bottomAnchorRef?: React.RefObject<HTMLDivElement | null>;
  }
>(
  (
    {
      className,
      children,
      label,
      labelTooltip,
      leftAnchorRef,
      rightAnchorRef,
      topAnchorRef,
      bottomAnchorRef,
    },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-xl border p-3 backdrop-blur-sm',
        'border-border/50 dark:border-border/70',
        'bg-background/50 dark:bg-background/60',
        className
      )}
    >
      {/* Edge anchors for beam connections - positioned flush at container edges */}
      {leftAnchorRef && (
        <div ref={leftAnchorRef} className="absolute -left-px top-1/2 size-px -translate-y-1/2" />
      )}
      {rightAnchorRef && (
        <div ref={rightAnchorRef} className="absolute -right-px top-1/2 size-px -translate-y-1/2" />
      )}
      {topAnchorRef && (
        <div ref={topAnchorRef} className="absolute left-1/2 -top-px size-px -translate-x-1/2" />
      )}
      {bottomAnchorRef && (
        <div
          ref={bottomAnchorRef}
          className="absolute -bottom-px left-1/2 size-px -translate-x-1/2"
        />
      )}
      {/* Label ABOVE content */}
      {label &&
        (labelTooltip ? (
          <SectionTitle title={label} tooltip={labelTooltip} />
        ) : (
          <span className="text-xs text-muted-foreground">{label}</span>
        ))}
      {children}
    </div>
  )
);
GroupContainer.displayName = 'GroupContainer';

// Central registry hub - title ABOVE logo with CAIP-10 emission, with edge anchors
export const RegistryHub = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    logoRef: React.RefObject<HTMLDivElement | null>;
    leftAnchorRef?: React.RefObject<HTMLDivElement | null>;
    rightAnchorRef?: React.RefObject<HTMLDivElement | null>;
    bottomAnchorRef?: React.RefObject<HTMLDivElement | null>;
    showLabels?: boolean;
  }
>(
  (
    { className, logoRef, leftAnchorRef, rightAnchorRef, bottomAnchorRef, showLabels = true },
    ref
  ) => (
    <div ref={ref} className={cn('relative z-20 flex flex-col items-center', className)}>
      {/* CAIP-10 Emission Animation - positioned above title */}
      <Caip10Emission />
      {/* Title ABOVE logo with info icon */}
      {showLabels && (
        <div className="mb-3 flex items-center gap-1">
          <span className="text-sm font-bold text-foreground">Stolen Wallet Registry</span>
          <InfoTooltip
            content="The consolidated registry on Base stores stolen wallet AND fraudulent transaction reports from all chains. CAIP-10/CAIP-220 compliant storage enables tracking wallet addresses and transactions from any blockchain (Ethereum, Solana, Bitcoin, etc.)."
            ariaLabel="Info about Stolen Wallet Registry"
            iconSize="size-3.5"
          />
        </div>
      )}
      {/* Logo element with edge anchors - flush positioning */}
      <div className="relative">
        {leftAnchorRef && (
          <div ref={leftAnchorRef} className="absolute -left-px top-1/2 size-px -translate-y-1/2" />
        )}
        {rightAnchorRef && (
          <div
            ref={rightAnchorRef}
            className="absolute -right-px top-1/2 size-px -translate-y-1/2"
          />
        )}
        {bottomAnchorRef && (
          <div
            ref={bottomAnchorRef}
            className="absolute -bottom-px left-1/2 size-px -translate-x-1/2"
          />
        )}
        <div
          ref={logoRef}
          className="flex size-20 items-center justify-center rounded-full border-2 border-border bg-background shadow-lg"
        >
          <NetworkBase variant="branded" className="size-12" />
        </div>
      </div>
    </div>
  )
);
RegistryHub.displayName = 'RegistryHub';

// Mobile section container
export function MobileSection({
  children,
  label,
  tooltip,
  className,
}: {
  children: React.ReactNode;
  label?: string;
  tooltip?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center gap-2 rounded-xl border p-4 backdrop-blur-sm',
        'border-border/50 dark:border-border/70',
        'bg-background/50 dark:bg-background/60',
        className
      )}
    >
      {label && tooltip && <SectionTitle title={label} tooltip={tooltip} />}
      {label && !tooltip && (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      )}
      {children}
    </div>
  );
}

// Mobile registry hub (no CAIP emission - without beams it lacks context)
export function MobileRegistryHub({ showLabels = true }: { showLabels?: boolean }) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col items-center gap-3 rounded-xl border p-4 backdrop-blur-sm',
        'border-border/50 dark:border-border/70',
        'bg-background/50 dark:bg-background/60'
      )}
    >
      {showLabels && (
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold text-foreground">Stolen Wallet Registry</span>
          <InfoTooltip
            content="The consolidated registry on Base stores stolen wallet AND fraudulent transaction reports from all chains. CAIP-10/CAIP-220 compliant storage enables tracking wallet addresses and transactions from any blockchain (Ethereum, Solana, Bitcoin, etc.)."
            ariaLabel="Info about Stolen Wallet Registry"
            iconSize="size-3.5"
          />
        </div>
      )}

      <div className="flex size-16 items-center justify-center rounded-full border-2 border-border bg-background shadow-lg">
        <NetworkBase variant="branded" className="size-10" />
      </div>
    </div>
  );
}
