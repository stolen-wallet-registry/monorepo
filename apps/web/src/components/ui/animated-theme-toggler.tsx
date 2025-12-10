import { useCallback, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { flushSync } from 'react-dom';

import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/useTheme';

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<'button'> {
  duration?: number;
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) => {
  const { resolvedColorScheme, setColorScheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDark = resolvedColorScheme === 'dark';

  const toggleTheme = useCallback(async () => {
    if (!buttonRef.current) return;

    const newScheme = isDark ? 'light' : 'dark';

    // Check if View Transitions API is supported
    if (!document.startViewTransition) {
      setColorScheme(newScheme);
      return;
    }

    // Mark that we're using View Transition (disables CSS transitions)
    document.documentElement.setAttribute('data-view-transition', '');

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setColorScheme(newScheme);
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
    transition.finished.then(() => {
      document.documentElement.removeAttribute('data-view-transition');
    });
  }, [isDark, duration, setColorScheme]);

  return (
    <button ref={buttonRef} onClick={toggleTheme} className={cn(className)} {...props}>
      {isDark ? <Sun /> : <Moon />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};
