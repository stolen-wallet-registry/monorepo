import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { flushSync } from 'react-dom';

import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/useTheme';
import type { ColorScheme, ThemeVariant } from '@/providers/ThemeProviderContext';

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<'button'> {
  duration?: number;
}

/** Handle exposed by AnimatedThemeToggler for programmatic control */
export interface ThemeTogglerHandle {
  /** Trigger animated switch to a specific theme variant, optionally also switching color scheme in the same animation */
  triggerVariantSwitch: (variant: ThemeVariant, colorScheme?: ColorScheme) => void;
}

export const AnimatedThemeToggler = forwardRef<ThemeTogglerHandle, AnimatedThemeTogglerProps>(
  function AnimatedThemeToggler({ className, duration = 400, onClick, ...rest }, ref) {
    const { resolvedColorScheme, setColorScheme, themeVariant, setThemeVariant } = useTheme();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const isDark = resolvedColorScheme === 'dark';

    /**
     * Runs View Transitions animation from button position, executing updateFn during transition.
     */
    const animateTransition = useCallback(
      async (updateFn: () => void) => {
        // Check if View Transitions API is supported
        if (!document.startViewTransition) {
          updateFn();
          return;
        }

        // Fallback if button not mounted
        if (!buttonRef.current) {
          updateFn();
          return;
        }

        // Mark that we're using View Transition (disables CSS transitions)
        document.documentElement.setAttribute('data-view-transition', '');

        const transition = document.startViewTransition(() => {
          flushSync(() => {
            updateFn();
          });
        });

        await transition.ready;

        // Re-check ref after async gap (component may have unmounted)
        if (!buttonRef.current) return;

        const { top, left, width, height } = buttonRef.current.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const maxRadius = Math.hypot(
          Math.max(left, window.innerWidth - left),
          Math.max(top, window.innerHeight - top)
        );

        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`],
          },
          {
            duration,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          }
        );

        // Clean up after animation completes
        transition.finished.then(() => {
          document.documentElement.removeAttribute('data-view-transition');
        });
      },
      [duration]
    );

    const toggleColorScheme = useCallback(async () => {
      const newScheme = isDark ? 'light' : 'dark';
      await animateTransition(() => setColorScheme(newScheme));
    }, [isDark, animateTransition, setColorScheme]);

    const triggerVariantSwitch = useCallback(
      (variant: ThemeVariant, colorScheme?: ColorScheme) => {
        // Skip if nothing to change
        const variantSame = themeVariant === variant;
        const schemeSame = !colorScheme || resolvedColorScheme === colorScheme;
        if (variantSame && schemeSame) return;

        animateTransition(() => {
          if (!variantSame) setThemeVariant(variant);
          if (colorScheme && !schemeSame) setColorScheme(colorScheme);
        }).catch((err) => {
          if (err.name !== 'AbortError' && err.name !== 'InvalidStateError') console.error(err);
        });
      },
      [themeVariant, resolvedColorScheme, animateTransition, setThemeVariant, setColorScheme]
    );

    // Expose imperative handle for programmatic control
    useImperativeHandle(
      ref,
      () => ({
        triggerVariantSwitch,
      }),
      [triggerVariantSwitch]
    );

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        toggleColorScheme().catch((err) => {
          if (err.name !== 'AbortError' && err.name !== 'InvalidStateError') console.error(err);
        });
        onClick?.(event);
      },
      [toggleColorScheme, onClick]
    );

    return (
      <button
        ref={buttonRef}
        {...rest}
        type="button"
        onClick={handleClick}
        className={cn(className)}
        aria-pressed={isDark}
      >
        {isDark ? <Sun /> : <Moon />}
        <span className="sr-only">Toggle theme</span>
      </button>
    );
  }
);
