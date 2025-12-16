/**
 * Info tooltip component for displaying help text.
 *
 * Small info icon that shows a tooltip on hover with explanatory text.
 */

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { cn } from '@/lib/utils';

export interface InfoTooltipProps {
  /** Tooltip content - can be string or JSX */
  content: React.ReactNode;
  /** Size of the info icon */
  size?: 'sm' | 'md';
  /** Additional class names for the trigger button */
  className?: string;
  /** Side to show tooltip */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Info icon with tooltip for explanatory help text.
 */
export function InfoTooltip({ content, size = 'sm', className, side = 'top' }: InfoTooltipProps) {
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-full',
            'text-muted-foreground hover:text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            'transition-colors',
            className
          )}
          aria-label="More information"
        >
          <Info className={iconSize} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
