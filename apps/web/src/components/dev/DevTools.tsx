import { useState, useCallback, useEffect, useRef } from 'react';

import { useTheme, type ColorScheme, type ThemeVariant } from '@/providers';
import { cn } from '@/lib/utils';

/**
 * Development-only tools panel for testing theming and other dev features.
 * Only renders in development mode (import.meta.env.DEV).
 */
export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { colorScheme, setColorScheme, themeVariant, setThemeVariant, resolvedColorScheme } =
    useTheme();

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    // Delay adding listener to avoid immediate close from the toggle click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Only render in development
  if (import.meta.env.PROD) {
    return null;
  }

  const colorSchemeOptions: ColorScheme[] = ['light', 'dark', 'system'];
  const variantOptions: ThemeVariant[] = ['base', 'hacker'];

  return (
    <div ref={containerRef} className="fixed bottom-4 left-4 z-50" data-no-transition>
      {/* Toggle button */}
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full shadow-lg',
          'bg-primary text-primary-foreground',
          'hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'transition-transform hover:scale-105'
        )}
        aria-label={isOpen ? 'Close dev tools' : 'Open dev tools'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )}
      </button>

      {/* Drawer panel */}
      {isOpen && (
        <div
          className={cn(
            'absolute bottom-14 left-0 min-w-72',
            'rounded-lg border bg-card p-4 shadow-xl',
            'animate-in slide-in-from-bottom-2 fade-in-0 duration-200'
          )}
        >
          <h3 className="mb-4 text-sm font-semibold text-foreground">Dev Tools</h3>

          {/* Theme Variant Toggle */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Theme Variant
            </label>
            <div className="flex gap-2">
              {variantOptions.map((variant) => (
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
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Color Scheme
            </label>
            <div className="flex gap-2">
              {colorSchemeOptions.map((scheme) => (
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
              <p>
                <span className="text-foreground">classes:</span>{' '}
                <span className="break-all">
                  {typeof document !== 'undefined' && document.documentElement.className}
                </span>
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
        </div>
      )}
    </div>
  );
}
