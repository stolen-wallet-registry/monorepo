import { useCallback } from 'react';
import { Terminal, Paintbrush } from 'lucide-react';

import { Button, Tooltip, TooltipTrigger, TooltipContent } from '@swr/ui';
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
        <Button
          variant="outline"
          size="icon"
          onClick={toggle}
          className={cn(className)}
          aria-label={isHacker ? 'Switch to base theme' : 'Switch to hacker theme'}
        >
          {isHacker ? <Paintbrush className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
          <span className="sr-only">Toggle theme variant</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{isHacker ? 'Base theme' : 'Hacker theme'}</TooltipContent>
    </Tooltip>
  );
}
