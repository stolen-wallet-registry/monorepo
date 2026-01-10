import { createContext } from 'react';

/** Color scheme preference (light, dark, or follow system) */
export type ColorScheme = 'light' | 'dark' | 'system';

/** Theme variant - visual style independent of light/dark */
export type ThemeVariant = 'base' | 'hacker';

/** Resolved color scheme (system preference resolved to actual light/dark) */
export type ResolvedColorScheme = Exclude<ColorScheme, 'system'>;

export type ThemeProviderState = {
  /** Current color scheme setting */
  colorScheme: ColorScheme;
  /** Resolved color scheme (system preference resolved to light/dark) */
  resolvedColorScheme: ResolvedColorScheme;
  /** Current theme variant */
  themeVariant: ThemeVariant;
  /** Set the color scheme preference */
  setColorScheme: (scheme: ColorScheme) => void;
  /** Set the theme variant */
  setThemeVariant: (variant: ThemeVariant) => void;
  /** Trigger animated theme variant switch (set by AnimatedThemeToggler) */
  triggerThemeAnimation: ((variant: ThemeVariant) => void) | null;
  /** Register the animated theme trigger function */
  setTriggerThemeAnimation: (fn: ((variant: ThemeVariant) => void) | null) => void;
};

export const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);
