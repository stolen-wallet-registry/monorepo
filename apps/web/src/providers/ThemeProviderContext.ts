import { createContext } from 'react';

type Theme = 'dark' | 'light' | 'system';

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** The resolved theme (system preference resolved to light/dark) */
  resolvedTheme: 'light' | 'dark';
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  resolvedTheme: 'light',
};

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
