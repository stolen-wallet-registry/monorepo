'use client';

import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { domAnimation, LazyMotion, m, useAnimate } from 'motion/react';
import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  HyperlaneLogo,
  WormholeLogo,
  ChainalysisLogo,
  SealTeamLogo,
  TrmLabsLogo,
} from '@swr/ui';

import { BEAM_DURATION } from './constants';

// Touch-friendly tooltip: opens on tap for touch devices, hover for desktop.
// Uses coarse pointer media query to detect touch at render time.
function useTouchTooltip() {
  const [open, setOpen] = useState(false);
  const handleTap = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    // Only toggle on touch devices (coarse pointer)
    if (window.matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);
  // These icons carry an onClick, so they are interactive and must be reachable and
  // operable from the keyboard, not just by pointer. Radix opens the tooltip on focus once
  // the trigger is focusable; Enter/Space toggle it the same way a tap does.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);
  return { open, setOpen, handleTap, handleKeyDown };
}

/** Static lookup — hoisted so it isn't rebuilt on every IconCircle render. */
const ICON_SIZE_CLASSES = {
  xs: 'size-8 p-1',
  sm: 'size-10 p-1.5',
  md: 'size-12 p-2',
  lg: 'size-14 p-2.5',
};

// Icon with tooltip wrapper - accessibility improved
export const IconCircle = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children: React.ReactNode;
    label: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    pulse?: boolean;
    pulseDelay?: number;
    /** Event-driven pulse trigger. When transitions to true, plays pulse animation once. */
    triggerPulse?: boolean;
  }
>(
  (
    { className, children, label, size = 'md', pulse = false, pulseDelay = 0, triggerPulse },
    ref
  ) => {
    const [scopeRef, animate] = useAnimate<HTMLDivElement>();
    const prevTriggerRef = useRef(triggerPulse);
    const { open, setOpen, handleTap, handleKeyDown } = useTouchTooltip();

    // Compose the forwarded ref with useAnimate's scope ref at attach time instead of syncing
    // them from an effect. Writing the parent's ref inside an effect is what makes this look
    // like a child pushing data upwards: the parent only learns about the node one commit
    // late, and it never learns about detach at all, so an unmount leaves the parent holding a
    // stale node. A ref callback runs during commit for both attach (node) and detach (null),
    // which is exactly the contract React already gives callers of `ref`.
    const attachRefs = useCallback(
      (node: HTMLDivElement | null) => {
        // `scopeRef` is a normal ref object that useAnimate reads to resolve animation targets;
        // its `current` is typed non-null, hence the cast for the detach case.
        (scopeRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [ref, scopeRef]
    );

    // Handle event-driven pulse trigger
    useEffect(() => {
      // Only trigger when transitioning from false to true
      if (triggerPulse && !prevTriggerRef.current && scopeRef.current) {
        // Delay pulse until beam reaches the icon (BEAM_DURATION seconds)
        animate(
          scopeRef.current,
          {
            boxShadow: [
              '0 0 0 0 rgba(34, 197, 94, 0)',
              '0 0 0 8px rgba(34, 197, 94, 0.3)',
              '0 0 0 0 rgba(34, 197, 94, 0)',
            ],
          },
          { duration: 1.5, delay: BEAM_DURATION }
        );
      }
      prevTriggerRef.current = triggerPulse;
    }, [triggerPulse, animate, scopeRef]);

    return (
      // LazyMotion wraps the whole Tooltip rather than sitting directly around the `m.div`:
      // TooltipTrigger uses Radix `asChild`, which clones its single child and forwards props
      // and a ref to it. A LazyMotion in that slot would swallow both — it renders no DOM node
      // and accepts no ref — and the tooltip would stop working. `domAnimation` is enough here;
      // the pulse is a plain `animate` keyframe sequence with no layout projection or drag.
      <LazyMotion features={domAnimation}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <m.div
              ref={attachRefs}
              className={cn(
                'relative z-10 flex cursor-pointer items-center justify-center rounded-full border-2 border-border bg-background shadow-md transition-transform hover:scale-110',
                ICON_SIZE_CLASSES[size],
                className
              )}
              aria-label={label}
              role="button"
              tabIndex={0}
              onClick={handleTap}
              onKeyDown={handleKeyDown}
              animate={
                pulse
                  ? {
                      boxShadow: [
                        '0 0 0 0 rgba(34, 197, 94, 0)',
                        '0 0 0 8px rgba(34, 197, 94, 0.3)',
                        '0 0 0 0 rgba(34, 197, 94, 0)',
                      ],
                    }
                  : {}
              }
              transition={
                pulse
                  ? {
                      duration: 1.5,
                      repeat: Infinity,
                      delay: pulseDelay,
                      repeatDelay: BEAM_DURATION - 1.5,
                    }
                  : {}
              }
            >
              {children}
            </m.div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </LazyMotion>
    );
  }
);
IconCircle.displayName = 'IconCircle';

// Bridge icon (smaller, subtle) - accessibility improved
export const BridgeIcon = forwardRef<
  HTMLElement,
  { className?: string; children: React.ReactNode; label: string }
>(({ className, children, label }, ref) => {
  const { open, setOpen, handleTap, handleKeyDown } = useTouchTooltip();
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          ref={ref as React.Ref<HTMLButtonElement>}
          className={cn(
            'z-10 flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background p-1.5 shadow-sm transition-transform hover:scale-110',
            className
          )}
          aria-label={label}
          onClick={handleTap}
          onKeyDown={handleKeyDown}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
});
BridgeIcon.displayName = 'BridgeIcon';

// Re-export all logos from @swr/ui for convenience
export { HyperlaneLogo, WormholeLogo, ChainalysisLogo, SealTeamLogo, TrmLabsLogo };
export { GroomLakePngLogo } from './GroomLakePng';
