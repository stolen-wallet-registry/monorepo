'use client';

import React, { forwardRef, useEffect, useRef } from 'react';
import { motion, useAnimate } from 'motion/react';
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
    const [scope, animate] = useAnimate<HTMLDivElement>();
    const prevTriggerRef = useRef(triggerPulse);

    const sizeClasses = {
      xs: 'size-8 p-1',
      sm: 'size-10 p-1.5',
      md: 'size-12 p-2',
      lg: 'size-14 p-2.5',
    };

    // Sync forwardRef with internal scope ref
    useEffect(() => {
      if (scope.current) {
        if (typeof ref === 'function') {
          ref(scope.current);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = scope.current;
        }
      }
    }, [ref, scope]);

    // Handle event-driven pulse trigger
    useEffect(() => {
      // Only trigger when transitioning from false to true
      if (triggerPulse && !prevTriggerRef.current && scope.current) {
        // Delay pulse until beam reaches the icon (BEAM_DURATION seconds)
        animate(
          scope.current,
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
    }, [triggerPulse, animate, scope]);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            ref={scope}
            className={cn(
              'relative z-10 flex cursor-pointer items-center justify-center rounded-full border-2 border-border bg-background shadow-md transition-transform hover:scale-110',
              sizeClasses[size],
              className
            )}
            aria-label={label}
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
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
);
IconCircle.displayName = 'IconCircle';

// Bridge icon (smaller, subtle) - accessibility improved
export const BridgeIcon = forwardRef<
  HTMLDivElement,
  { className?: string; children: React.ReactNode; label: string }
>(({ className, children, label }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div
        ref={ref}
        className={cn(
          'z-10 flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background p-1.5 shadow-sm transition-transform hover:scale-110',
          className
        )}
        aria-label={label}
        role="img"
      >
        {children}
      </div>
    </TooltipTrigger>
    <TooltipContent>
      <p>{label}</p>
    </TooltipContent>
  </Tooltip>
));
BridgeIcon.displayName = 'BridgeIcon';

// Re-export all logos from @swr/ui for convenience
export { HyperlaneLogo, WormholeLogo, ChainalysisLogo, SealTeamLogo, TrmLabsLogo };
export { GroomLakePngLogo } from './GroomLakePng';
