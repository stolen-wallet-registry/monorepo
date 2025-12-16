export const THEME_COMBINATIONS = {
  'light-base': { colorScheme: 'light', variant: 'base' },
  'dark-base': { colorScheme: 'dark', variant: 'base' },
  'light-hacker': { colorScheme: 'light', variant: 'hacker' },
  'dark-hacker': { colorScheme: 'dark', variant: 'hacker' },
} as const;

export type ThemeKey = keyof typeof THEME_COMBINATIONS;

/** All unique CSS classes used across theme combinations (for cleanup in ThemeWrapper) */
export const ALL_THEME_CLASSES = [
  ...new Set(Object.values(THEME_COMBINATIONS).flatMap((t) => [t.colorScheme, t.variant])),
] as const;
