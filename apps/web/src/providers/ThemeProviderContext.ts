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

  // Legacy aliases for backward compatibility
  /** @deprecated Use colorScheme instead */
  theme: ColorScheme;
  /** @deprecated Use setColorScheme instead */
  setTheme: (scheme: ColorScheme) => void;
  /** @deprecated Use resolvedColorScheme instead */
  resolvedTheme: 'light' | 'dark';
};

const initialState: ThemeProviderState = {
  colorScheme: 'system',
  resolvedColorScheme: 'light',
  themeVariant: 'base',
  setColorScheme: () => null,
  setThemeVariant: () => null,
  // Legacy
  theme: 'system',
  setTheme: () => null,
  resolvedTheme: 'light',
};

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
