import Image from 'next/image';

import { cn } from '@swr/ui';

interface GroomLakePngLogoProps {
  className?: string;
}

/**
 * PNG-based Groom Lake logo component.
 * Renders the PNG from /public/groomlake.png at the same sizes as the SVG icon components
 * used inside IconCircle (xs=size-4, sm=size-5/6, md=size-7).
 *
 * In dark mode the PNG is inverted so the dark logo shapes become light.
 *
 * Uses next/image rather than a bare <img> so the asset goes through the
 * framework's optimization pipeline like every other raster asset on the page.
 * The prop surface is deliberately just `className`: every call site passes
 * either nothing or a class, and accepting the full ComponentProps<'img'> set
 * would let callers pass attributes next/image handles differently (src,
 * srcSet, loading).
 */
export function GroomLakePngLogo({ className }: GroomLakePngLogoProps) {
  return (
    <Image
      src="/groomlake.png"
      alt="Groom Lake"
      width={20}
      height={20}
      className={cn('size-5 dark:invert', className)}
    />
  );
}
