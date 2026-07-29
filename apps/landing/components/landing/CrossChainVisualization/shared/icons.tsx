'use client';

import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
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

/*
 * ACCESSIBILITY CONTRACT FOR THIS FILE
 *
 * `IconCircle` and `BridgeIcon` are decorative nodes in an illustration. There are ~40 of
 * them on the desktop diagram and ~30 on mobile. Neither navigates, filters, toggles or
 * submits anything: the only thing either one "does" is display its own brand name in a
 * tooltip on hover, and that name is already on the element as `aria-label`, so assistive
 * technology reads the whole diagram without ever needing to reach the tooltip.
 *
 * Therefore: NO click handlers, NO tabIndex, `role="img"` + `aria-label`, and out of the tab
 * order. Two earlier passes pulled in opposite directions and neither was right —
 *
 *   - `role="button" tabIndex={0}` on IconCircle and a native `<button>` on BridgeIcon put
 *     ~40 tab stops between the hero and the footer, each popping a tooltip on focus. That is
 *     strictly worse for keyboard and screen-reader users than decorative treatment, and it
 *     bought them nothing they did not already have from `aria-label`.
 *   - A tap-to-open-tooltip `onClick` (coarse-pointer only) made them clickable-without-
 *     keyboard-equivalent, which is the thing every a11y linter correctly flags. The tooltip
 *     it enabled is a nicety on touch — the nodes are brand logos sitting inside labelled
 *     sections — not the only route to the information.
 *
 * Consequence: on touch devices the tooltips no longer open. That is the accepted cost of
 * these being decorations rather than controls.
 *
 * If they ever gain real behaviour, they must become genuine controls again — and then as ONE
 * escapable group (a single tab stop into the diagram with roving tabindex), not 40 stops.
 */

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
        <Tooltip>
          <TooltipTrigger asChild>
            <m.div
              ref={attachRefs}
              className={cn(
                'relative z-10 flex items-center justify-center rounded-full border-2 border-border bg-background shadow-md transition-transform hover:scale-110',
                ICON_SIZE_CLASSES[size],
                className
              )}
              aria-label={label}
              // Decorative diagram node — see the accessibility contract at the top of this
              // file. `role="img"` + aria-label is the whole accessible payload: no tabIndex,
              // no click handler, not a tab stop.
              role="img"
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
  return (
    <Tooltip>
      {/*
       * A div, not a <button>: this is a decorative bridge marker in the diagram, and making
       * it a button added a tab stop per bridge for no behaviour (see the accessibility
       * contract at the top of this file). Its label is exposed via role="img" + aria-label.
       * The hand-rolled Enter/Space handler that lived here was also redundant on a native
       * <button>, which synthesises a click from those keys itself.
       */}
      <TooltipTrigger asChild>
        <div
          ref={ref as React.Ref<HTMLDivElement>}
          role="img"
          className={cn(
            'z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background p-1.5 shadow-sm transition-transform hover:scale-110',
            className
          )}
          aria-label={label}
        >
          {children}
        </div>
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
