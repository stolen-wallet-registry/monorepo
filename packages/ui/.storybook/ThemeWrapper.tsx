import { useEffect, type ReactNode } from 'react';
import { THEME_COMBINATIONS, ALL_THEME_CLASSES, type ThemeKey } from './theme-config';

export function ThemeWrapper({ themeKey, children }: { themeKey: ThemeKey; children: ReactNode }) {
  const theme = THEME_COMBINATIONS[themeKey];

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes (derived from config to avoid drift)
    root.classList.remove(...ALL_THEME_CLASSES);
    root.classList.add(theme.colorScheme, theme.variant);
  }, [theme.colorScheme, theme.variant]);

  return <>{children}</>;
}
