import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useChainId, usePublicClient } from 'wagmi';

import { useTheme } from '@/providers';
import { cn } from '@/lib/utils';
import { ThemeTab } from './devtools/ThemeTab';
import { TestsTab } from './devtools/TestsTab';
import { SoulboundTab } from './devtools/SoulboundTab';
import { WalletTab } from './devtools/WalletTab';

type DevToolsTab = 'theme' | 'tests' | 'soulbound' | 'wallet';

const DEVTOOLS_TABS: DevToolsTab[] = ['theme', 'tests', 'soulbound', 'wallet'];

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
  // Soulbound preview state
  const [previewType, setPreviewType] = useState<'wallet' | 'support'>('wallet');
  // Wallet nonce state
  const [blockchainNonce, setBlockchainNonce] = useState<bigint | null>(null);
  const [nonceLoading, setNonceLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { colorScheme, setColorScheme, themeVariant, setThemeVariant, resolvedColorScheme } =
    useTheme();

  // Wallet hooks for nonce display
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  // CRITICAL: Must pass chainId for correct cross-chain client
  const publicClient = usePublicClient({ chainId });

  // Fetch blockchain nonce
  const fetchNonce = useCallback(async () => {
    if (!address || !publicClient) return;
    setNonceLoading(true);
    try {
      const nonce = await publicClient.getTransactionCount({ address });
      setBlockchainNonce(BigInt(nonce));
    } catch (err) {
      console.error('Failed to fetch nonce:', err);
      setBlockchainNonce(null);
    } finally {
      setNonceLoading(false);
    }
  }, [address, publicClient]);

  // Wallet tab refresh: clear the stale value first so the UI shows the placeholder
  // while the new count is in flight.
  const handleRefreshNonce = useCallback(() => {
    setBlockchainNonce(null);
    fetchNonce();
  }, [fetchNonce]);

  // Auto-fetch nonce when wallet tab is active and connected
  useEffect(() => {
    if (isOpen && activeTab === 'wallet' && isConnected) {
      fetchNonce();
    }
  }, [isOpen, activeTab, isConnected, fetchNonce]);

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
            'absolute bottom-14 left-0 min-w-80 max-w-[360px]',
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
              const currentIndex = DEVTOOLS_TABS.indexOf(activeTab);
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % DEVTOOLS_TABS.length;
                const next = DEVTOOLS_TABS[nextIndex];
                if (next) setActiveTab(next);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + DEVTOOLS_TABS.length) % DEVTOOLS_TABS.length;
                const prev = DEVTOOLS_TABS[prevIndex];
                if (prev) setActiveTab(prev);
              } else if (e.key === 'Home') {
                e.preventDefault();
                const first = DEVTOOLS_TABS[0];
                if (first) setActiveTab(first);
              } else if (e.key === 'End') {
                e.preventDefault();
                const last = DEVTOOLS_TABS[DEVTOOLS_TABS.length - 1];
                if (last) setActiveTab(last);
              }
            }}
          >
            {DEVTOOLS_TABS.map((tab) => (
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
              <ThemeTab
                colorScheme={colorScheme}
                setColorScheme={setColorScheme}
                themeVariant={themeVariant}
                setThemeVariant={setThemeVariant}
                resolvedColorScheme={resolvedColorScheme}
              />
            )}

            {/* Tests Tab */}
            {activeTab === 'tests' && <TestsTab onTriggerError={() => setErrorKey(Date.now())} />}

            {/* Soulbound Tab */}
            {activeTab === 'soulbound' && (
              <SoulboundTab previewType={previewType} setPreviewType={setPreviewType} />
            )}

            {/* Wallet Tab */}
            {activeTab === 'wallet' && (
              <WalletTab
                isConnected={isConnected}
                address={address}
                chainId={chainId}
                blockchainNonce={blockchainNonce}
                nonceLoading={nonceLoading}
                onRefreshNonce={handleRefreshNonce}
              />
            )}
          </div>
        </div>
      )}

      {/* Error thrower component - only renders when errorKey is set */}
      {errorKey !== null && <ErrorThrower key={errorKey} />}
    </div>
  );
}
