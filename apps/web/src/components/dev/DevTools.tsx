import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useTheme, type ColorScheme, type ThemeVariant } from '@/providers';
import { cn } from '@/lib/utils';

type DevToolsTab = 'theme' | 'tests';

/**
 * Component that throws an error on mount.
 * Used to test the ErrorBoundary.
 * Always throws - parent controls mounting via key prop.
 */
function ErrorThrower(): never {
  throw new Error('Test error from DevTools - ErrorBoundary is working!');
}

/**
 * Development-only tools panel for testing theming and other dev features.
 * Only renders in development mode (import.meta.env.DEV).
 *
 * Note: P2P debug info is displayed on P2P registration pages via P2PDebugPanel.
 */
export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DevToolsTab>('theme');
  // errorKey controls when ErrorThrower renders - null means no error
  // Using a function initializer ensures fresh state on HMR
  const [errorKey, setErrorKey] = useState<number | null>(() => null);
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
            'absolute bottom-14 left-0 min-w-80 max-w-96',
            'rounded-lg border bg-card shadow-xl',
            'animate-in slide-in-from-bottom-2 fade-in-0 duration-200'
          )}
        >
          {/* Tab Header */}
          <div
            className="flex border-b border-border"
            role="tablist"
            aria-label="DevTools sections"
            onKeyDown={(e) => {
              const tabs: DevToolsTab[] = ['theme', 'tests'];
              const currentIndex = tabs.indexOf(activeTab);
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % tabs.length;
                setActiveTab(tabs[nextIndex]);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                setActiveTab(tabs[prevIndex]);
              } else if (e.key === 'Home') {
                e.preventDefault();
                setActiveTab(tabs[0]);
              } else if (e.key === 'End') {
                e.preventDefault();
                setActiveTab(tabs[tabs.length - 1]);
              }
            }}
          >
            {(['theme', 'tests'] as DevToolsTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`devtools-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`devtools-tabpanel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wide',
                  'transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring',
                  activeTab === tab
                    ? 'border-b-2 border-primary bg-muted/50 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div
            className="p-4"
            role="tabpanel"
            id={`devtools-tabpanel-${activeTab}`}
            aria-labelledby={`devtools-tab-${activeTab}`}
          >
            {/* Theme Tab */}
            {activeTab === 'theme' && (
              <>
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
            )}

            {/* Tests Tab */}
            {activeTab === 'tests' && (
              <>
                {/* Toast Tests */}
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">Toast Tests</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toast.success('Success! Operation completed.')}
                      className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                    >
                      Success
                    </button>
                    <button
                      type="button"
                      onClick={() => toast.error('Error! Something went wrong.')}
                      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                    >
                      Error
                    </button>
                    <button
                      type="button"
                      onClick={() => toast.warning('Warning! Check this out.')}
                      className="rounded bg-yellow-600 px-2 py-1 text-xs text-white hover:bg-yellow-700"
                    >
                      Warning
                    </button>
                    <button
                      type="button"
                      onClick={() => toast.info('Info: Here is some information.')}
                      className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      Info
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = toast.loading('Loading... (auto-completes in 2s)');
                        setTimeout(() => {
                          toast.success('Loading complete!', { id });
                        }, 2000);
                      }}
                      className="rounded bg-gray-600 px-2 py-1 text-xs text-white hover:bg-gray-700"
                    >
                      Loading
                    </button>
                  </div>
                </div>

                {/* Error Boundary Test */}
                <div className="border-t border-border pt-3">
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                    Error Boundary Test
                  </h4>
                  <button
                    type="button"
                    onClick={() => setErrorKey(Date.now())}
                    className="rounded bg-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-800"
                  >
                    Trigger Error
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Throws an error to test the ErrorBoundary UI
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error thrower component - only renders when errorKey is set */}
      {errorKey !== null && <ErrorThrower key={errorKey} />}
    </div>
  );
}
