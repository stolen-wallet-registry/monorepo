import { useEffect, useState, useMemo, useCallback } from 'react';

import { ThemeProviderContext, type ColorScheme, type ThemeVariant } from './ThemeProviderContext';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultColorScheme?: ColorScheme;
  defaultVariant?: ThemeVariant;
  colorSchemeStorageKey?: string;
  variantStorageKey?: string;
};

const COLOR_SCHEME_KEY = 'swr-color-scheme';
const VARIANT_KEY = 'swr-theme-variant';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  defaultColorScheme = 'system',
  defaultVariant = 'base',
  colorSchemeStorageKey = COLOR_SCHEME_KEY,
  variantStorageKey = VARIANT_KEY,
  ...props
}: ThemeProviderProps) {
  // Color scheme state
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    const stored = localStorage.getItem(colorSchemeStorageKey);
    // Also check legacy key for migration
    const legacy = localStorage.getItem('swr-ui-theme');
    return (stored as ColorScheme) || (legacy as ColorScheme) || defaultColorScheme;
  });

  // Theme variant state
  const [themeVariant, setThemeVariantState] = useState<ThemeVariant>(
    () => (localStorage.getItem(variantStorageKey) as ThemeVariant) || defaultVariant
  );

  // Track system preference separately for reactive updates
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemTheme);

  // Derive resolved color scheme from colorScheme and systemPreference
  const resolvedColorScheme = useMemo<'light' | 'dark'>(() => {
    if (colorScheme === 'system') return systemPreference;
    return colorScheme;
  }, [colorScheme, systemPreference]);

  // Apply theme classes to document
  useEffect(() => {
    const root = window.document.documentElement;

    // Remove all theme-related classes
    root.classList.remove('light', 'dark', 'base', 'hacker');

    // Add current color scheme and variant
    root.classList.add(resolvedColorScheme);
    root.classList.add(themeVariant);
  }, [resolvedColorScheme, themeVariant]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setColorScheme = useCallback(
    (newScheme: ColorScheme) => {
      localStorage.setItem(colorSchemeStorageKey, newScheme);
      setColorSchemeState(newScheme);
    },
    [colorSchemeStorageKey]
  );

  const setThemeVariant = useCallback(
    (newVariant: ThemeVariant) => {
      localStorage.setItem(variantStorageKey, newVariant);
      setThemeVariantState(newVariant);
    },
    [variantStorageKey]
  );

  const value = useMemo(
    () => ({
      colorScheme,
      resolvedColorScheme,
      themeVariant,
      setColorScheme,
      setThemeVariant,
      // Legacy aliases for backward compatibility
      theme: colorScheme,
      setTheme: setColorScheme,
      resolvedTheme: resolvedColorScheme,
    }),
    [colorScheme, resolvedColorScheme, themeVariant, setColorScheme, setThemeVariant]
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
