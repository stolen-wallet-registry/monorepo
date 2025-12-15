import { useEffect, type ReactNode } from 'react';
import { THEME_COMBINATIONS, type ThemeKey } from './theme-config';

export function ThemeWrapper({ themeKey, children }: { themeKey: ThemeKey; children: ReactNode }) {
  const theme = THEME_COMBINATIONS[themeKey];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'base', 'hacker');
    root.classList.add(theme.colorScheme, theme.variant);
  }, [theme.colorScheme, theme.variant]);

  return <>{children}</>;
}
