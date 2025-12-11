import { createContext } from 'react';

/** Color scheme preference (light, dark, or follow system) */
export type ColorScheme = 'light' | 'dark' | 'system';

/** Theme variant - visual style independent of light/dark */
export type ThemeVariant = 'base' | 'hacker';

export type ThemeProviderState = {
  /** Current color scheme setting */
  colorScheme: ColorScheme;
  /** Resolved color scheme (system preference resolved to light/dark) */
  resolvedColorScheme: 'light' | 'dark';
  /** Current theme variant */
  themeVariant: ThemeVariant;
  /** Set the color scheme preference */
  setColorScheme: (scheme: ColorScheme) => void;
  /** Set the theme variant */
  setThemeVariant: (variant: ThemeVariant) => void;
};

export const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);
