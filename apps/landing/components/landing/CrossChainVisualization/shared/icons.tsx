'use client';

import React, { forwardRef } from 'react';
import { motion } from 'motion/react';
import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';

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
  }
>(({ className, children, label, size = 'md', pulse = false, pulseDelay = 0 }, ref) => {
  const sizeClasses = {
    xs: 'size-8 p-1',
    sm: 'size-10 p-1.5',
    md: 'size-12 p-2',
    lg: 'size-14 p-2.5',
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          ref={ref}
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
});
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

// Chainalysis Logo (custom since not in web3icons)
export function ChainalysisLogo({
  className,
  title = 'Chainalysis logo',
}: {
  className?: string;
  title?: string;
}) {
  const titleId = 'chainalysis-logo-title';
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-5', className)}
      fill="currentColor"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

// SEAL Team (Security Alliance) Logo - shield with seal/badge motif
export function SealTeamLogo({
  className,
  title = 'SEAL Team (Security Alliance)',
}: {
  className?: string;
  title?: string;
}) {
  const titleId = 'seal-team-logo-title';
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-5', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      {/* Shield outline */}
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      {/* Star/seal in center */}
      <path
        d="M12 8l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L7 11.5l3.5-.5L12 8z"
        fill="currentColor"
      />
    </svg>
  );
}
