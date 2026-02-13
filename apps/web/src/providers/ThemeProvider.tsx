import { useEffect, useState, useMemo, useCallback } from 'react';

import { ThemeProviderContext, type ColorScheme, type ThemeVariant } from './ThemeProviderContext';
import { logger } from '@/lib/logger';

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

// Safe localStorage read that works in SSR
function getStoredColorScheme(key: string, defaultValue: ColorScheme): ColorScheme {
  if (typeof window === 'undefined') return defaultValue;
  return (localStorage.getItem(key) as ColorScheme) || defaultValue;
}

function getStoredVariant(key: string, defaultValue: ThemeVariant): ThemeVariant {
  if (typeof window === 'undefined') return defaultValue;
  return (localStorage.getItem(key) as ThemeVariant) || defaultValue;
}

export function ThemeProvider({
  children,
  defaultColorScheme = 'system',
  defaultVariant = 'base',
  colorSchemeStorageKey = COLOR_SCHEME_KEY,
  variantStorageKey = VARIANT_KEY,
}: ThemeProviderProps) {
  // Color scheme state - use lazy initializer that's SSR-safe
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() =>
    getStoredColorScheme(colorSchemeStorageKey, defaultColorScheme)
  );

  // Theme variant state - use lazy initializer that's SSR-safe
  const [themeVariant, setThemeVariantState] = useState<ThemeVariant>(() =>
    getStoredVariant(variantStorageKey, defaultVariant)
  );

  // Track system preference separately for reactive updates
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemTheme);

  // Animated theme trigger function (registered by AnimatedThemeToggler)
  const [triggerThemeAnimation, setTriggerThemeAnimationState] = useState<
    ((variant: ThemeVariant, colorScheme?: ColorScheme) => void) | null
  >(null);

  // Wrap setter to track registration
  const setTriggerThemeAnimation = useCallback(
    (fn: ((variant: ThemeVariant, colorScheme?: ColorScheme) => void) | null) => {
      setTriggerThemeAnimationState(() => fn);
    },
    []
  );

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

    // Add current color scheme and variant (guard against null themeVariant)
    root.classList.add(resolvedColorScheme);
    root.classList.add(themeVariant ?? 'base');
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

  const value = useMemo(() => {
    // Defensive: ensure themeVariant is never null (shouldn't happen, but guard against HMR issues)
    const safeThemeVariant: ThemeVariant = themeVariant ?? 'base';
    if (themeVariant !== safeThemeVariant) {
      logger.ui.error('themeVariant was null, defaulting to base', {
        originalValue: themeVariant,
        originalType: typeof themeVariant,
      });
    }
    return {
      colorScheme,
      resolvedColorScheme,
      themeVariant: safeThemeVariant,
      setColorScheme,
      setThemeVariant,
      triggerThemeAnimation,
      setTriggerThemeAnimation,
    };
  }, [
    colorScheme,
    resolvedColorScheme,
    themeVariant,
    setColorScheme,
    setThemeVariant,
    triggerThemeAnimation,
    setTriggerThemeAnimation,
  ]);

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}
