export const THEME_COMBINATIONS = {
  'light-base': { colorScheme: 'light', variant: 'base' },
  'dark-base': { colorScheme: 'dark', variant: 'base' },
  'light-hacker': { colorScheme: 'light', variant: 'hacker' },
  'dark-hacker': { colorScheme: 'dark', variant: 'hacker' },
} as const;

export type ThemeKey = keyof typeof THEME_COMBINATIONS;
