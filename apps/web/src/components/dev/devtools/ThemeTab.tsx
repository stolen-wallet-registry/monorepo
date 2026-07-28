/**
 * DevTools "theme" tab panel.
 *
 * Presentational only - the theme context is read by DevTools and passed down, so the
 * panel stays a pure function of its props and the parent keeps a single subscription
 * to the theme provider.
 */

import { cn } from '@/lib/utils';
import type { ColorScheme, ThemeVariant } from '@/providers';

const COLOR_SCHEME_OPTIONS: ColorScheme[] = ['light', 'dark', 'system'];
const VARIANT_OPTIONS: ThemeVariant[] = ['base', 'hacker'];

interface ThemeTabProps {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  themeVariant: ThemeVariant;
  setThemeVariant: (variant: ThemeVariant) => void;
  resolvedColorScheme: string;
}

export function ThemeTab({
  colorScheme,
  setColorScheme,
  themeVariant,
  setThemeVariant,
  resolvedColorScheme,
}: ThemeTabProps) {
  return (
    <>
      {/* Theme Variant Toggle */}
      <div className="mb-4">
        <span
          id="devtools-theme-variant"
          className="mb-2 block text-xs font-medium text-muted-foreground"
        >
          Theme Variant
        </span>
        <div role="group" aria-labelledby="devtools-theme-variant" className="flex gap-2">
          {VARIANT_OPTIONS.map((variant) => (
            <button
              key={variant}
              type="button"
              onClick={() => setThemeVariant(variant)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize',
                'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                themeVariant === variant
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {variant}
            </button>
          ))}
        </div>
      </div>

      {/* Color Scheme Toggle */}
      <div className="mb-4">
        <span
          id="devtools-color-scheme"
          className="mb-2 block text-xs font-medium text-muted-foreground"
        >
          Color Scheme
        </span>
        <div role="group" aria-labelledby="devtools-color-scheme" className="flex gap-2">
          {COLOR_SCHEME_OPTIONS.map((scheme) => (
            <button
              key={scheme}
              type="button"
              onClick={() => setColorScheme(scheme)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium capitalize',
                'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                colorScheme === scheme
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {scheme}
            </button>
          ))}
        </div>
      </div>

      {/* Current State Display */}
      <div className="border-t border-border pt-3">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Current State</h4>
        <div className="space-y-1 font-mono text-xs text-muted-foreground">
          <p>
            <span className="text-foreground">colorScheme:</span> {colorScheme}
          </p>
          <p>
            <span className="text-foreground">resolved:</span> {resolvedColorScheme}
          </p>
          <p>
            <span className="text-foreground">variant:</span> {themeVariant}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 border-t border-border pt-3">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Quick Actions</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setThemeVariant('hacker');
              setColorScheme('dark');
            }}
            className="rounded bg-green-900 px-2 py-1 text-xs text-green-400 hover:bg-green-800"
          >
            Hacker Dark
          </button>
          <button
            type="button"
            onClick={() => {
              setThemeVariant('base');
              setColorScheme('dark');
            }}
            className="rounded bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800"
          >
            Base Dark
          </button>
          <button
            type="button"
            onClick={() => {
              setThemeVariant('base');
              setColorScheme('light');
            }}
            className="rounded bg-white px-2 py-1 text-xs text-black hover:bg-neutral-100"
          >
            Base Light
          </button>
        </div>
      </div>
    </>
  );
}
