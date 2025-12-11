import { useEffect, type ReactNode } from 'react';
import { THEME_COMBINATIONS, type ThemeKey } from './theme-config';

/**
 * Component wrapper that applies theme classes for Storybook.
 * Note: This intentionally does NOT clean up theme classes on unmount
 * because Storybook maintains persistent theme state between stories.
 */
export function ThemeWrapper({ themeKey, children }: { themeKey: ThemeKey; children: ReactNode }) {
  const theme = THEME_COMBINATIONS[themeKey];

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    root.classList.remove('light', 'dark', 'base', 'hacker');
    // Apply current theme combination
    root.classList.add(theme.colorScheme, theme.variant);
  }, [theme.colorScheme, theme.variant]);

  return <>{children}</>;
}
