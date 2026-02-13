import { useCallback } from 'react';
import { Terminal, Paintbrush } from 'lucide-react';

import { Tooltip, TooltipTrigger, TooltipContent } from '@swr/ui';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/useTheme';
import { logger } from '@/lib/logger';

export function ThemeVariantToggle({ className }: { className?: string }) {
  const { themeVariant, setThemeVariant, triggerThemeAnimation } = useTheme();
  const isHacker = themeVariant === 'hacker';

  const toggle = useCallback(() => {
    const target = isHacker ? 'base' : 'hacker';

    if (triggerThemeAnimation) {
      triggerThemeAnimation(target);
    } else {
      logger.ui.warn('triggerThemeAnimation not available, using direct switch', {
        component: 'ThemeVariantToggle',
      });
      setThemeVariant(target);
    }
  }, [isHacker, triggerThemeAnimation, setThemeVariant]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9',
            className
          )}
          aria-label={isHacker ? 'Switch to base theme' : 'Switch to hacker theme'}
        >
          {isHacker ? <Paintbrush className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
          <span className="sr-only">Toggle theme variant</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{isHacker ? 'Base theme' : 'Hacker theme'}</TooltipContent>
    </Tooltip>
  );
}
