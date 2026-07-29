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
 *
 * `loading="eager"` restores the behaviour of the <img> this replaced. next/image lazy-loads
 * by default, which made the logo pop in after the rest of the diagram had painted while the
 * inline SVG logos beside it were already there. Eager, not `priority`: the visualization is
 * the second section of the page, below the initial viewport, so a preload hint would be
 * wrong (and Next warns about preloaded-but-unused images). The asset is 20px — loading it
 * with the section costs nothing.
 */
export function GroomLakePngLogo({ className }: GroomLakePngLogoProps) {
  return (
    <Image
      src="/groomlake.png"
      alt="Groom Lake"
      width={20}
      height={20}
      loading="eager"
      className={cn('size-5 dark:invert', className)}
    />
  );
}
