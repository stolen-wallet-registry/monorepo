'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { flushSync } from 'react-dom';
import { useTheme } from 'next-themes';

import { cn } from '@swr/ui';

// React 18+ idiomatic pattern for client-side detection
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<'button'> {
  duration?: number;
}

export function AnimatedThemeToggler({
  className,
  duration = 400,
  onClick,
  ...rest
}: AnimatedThemeTogglerProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Avoid hydration mismatch by detecting client vs server
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  const isDark = resolvedTheme === 'dark';

  const toggleTheme = useCallback(async () => {
    if (!buttonRef.current) return;

    const newTheme = isDark ? 'light' : 'dark';

    // Check if View Transitions API is supported
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    // Mark that we're using View Transition (disables CSS transitions)
    document.documentElement.setAttribute('data-view-transition', '');

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setTheme(newTheme);
      });
    });

    await transition.ready;

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
    transition.finished
      .then(() => {
        document.documentElement.removeAttribute('data-view-transition');
      })
      .catch(() => {
        // Transition was skipped - still clean up
        document.documentElement.removeAttribute('data-view-transition');
      });
  }, [isDark, duration, setTheme]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      toggleTheme().catch(console.error);
      onClick?.(event);
    },
    [toggleTheme, onClick]
  );

  // Render a placeholder during SSR/hydration to avoid flash
  if (!mounted) {
    return (
      <button
        type="button"
        className={cn(
          'flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm',
          className
        )}
        aria-label="Toggle theme"
        disabled
      >
        <span className="size-5" />
      </button>
    );
  }

  return (
    <button
      ref={buttonRef}
      {...rest}
      type="button"
      onClick={handleClick}
      className={cn(
        'flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-accent',
        className
      )}
      aria-pressed={isDark}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
