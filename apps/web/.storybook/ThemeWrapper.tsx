import { useEffect, type ReactNode } from 'react';
import { THEME_COMBINATIONS, type ThemeKey } from './theme-config';

// Component wrapper that applies theme classes
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
