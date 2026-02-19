import type { ComponentProps } from 'react';

import { cn } from '@swr/ui';

/**
 * PNG-based Groom Lake logo component.
 * Renders the PNG from /public/groomlake.png at the same sizes as the SVG icon components
 * used inside IconCircle (xs=size-4, sm=size-5/6, md=size-7).
 *
 * In dark mode the PNG is inverted so the dark logo shapes become light.
 */
export function GroomLakePngLogo({ className, ...props }: ComponentProps<'img'>) {
  return (
    <img
      src="/groomlake.png"
      alt="Groom Lake"
      className={cn('size-5 dark:invert', className)}
      {...props}
    />
  );
}
