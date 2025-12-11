import { darkTheme, lightTheme, type Theme } from '@rainbow-me/rainbowkit';

import type { ThemeVariant } from '@/providers';

/**
 * Static color palettes that match our CSS theme variables.
 * These are hex equivalents of the OKLCH values in index.css.
 */
const PALETTES = {
  base: {
    light: {
      background: '#ffffff',
      foreground: '#000000',
      card: '#ffffff',
      // Accent: used for buttons AND some label text - needs to work for both
      accentColor: '#888888',
      accentColorForeground: '#ffffff',
      // Profile action overlays (subtle transparency like RainbowKit defaults)
      profileAction: 'rgba(0, 0, 0, 0.1)',
      profileActionHover: 'rgba(0, 0, 0, 0.15)',
      profileForeground: 'rgba(0, 0, 0, 0.04)',
      // Other
      muted: '#f5f5f5',
      mutedForeground: '#888888',
      border: '#e5e5e5',
      destructive: '#ef4444',
    },
    dark: {
      background: '#000000',
      foreground: '#ffffff',
      card: '#1a1a1a',
      // Accent: used for buttons AND some label text - needs to work for both
      accentColor: '#aaaaaa',
      accentColorForeground: '#000000',
      // Profile action overlays
      profileAction: 'rgba(255, 255, 255, 0.1)',
      profileActionHover: 'rgba(255, 255, 255, 0.2)',
      profileForeground: 'rgba(255, 255, 255, 0.05)',
      // Other
      muted: '#262626',
      mutedForeground: '#aaaaaa',
      border: '#333333',
      destructive: '#dc2626',
    },
  },
  hacker: {
    light: {
      background: '#f7fdf7',
      foreground: '#1a4d1a',
      card: '#f0faf0',
      // Accent: used for buttons AND some label text - medium green that works for both
      accentColor: '#3a8a3a',
      accentColorForeground: '#ffffff',
      // Profile action overlays
      profileAction: 'rgba(26, 77, 26, 0.1)',
      profileActionHover: 'rgba(26, 77, 26, 0.15)',
      profileForeground: 'rgba(26, 77, 26, 0.04)',
      // Other
      muted: '#e0f0e0',
      mutedForeground: '#3a7a3a',
      border: '#a0d0a0',
      destructive: '#dc2626',
    },
    dark: {
      background: '#0a140a',
      foreground: '#22cc22',
      card: '#0f1f0f',
      // Accent: used for buttons AND some label text - bright green that works for both
      accentColor: '#44cc44',
      accentColorForeground: '#001a00',
      // Profile action overlays
      profileAction: 'rgba(34, 255, 34, 0.1)',
      profileActionHover: 'rgba(34, 255, 34, 0.2)',
      profileForeground: 'rgba(34, 255, 34, 0.05)',
      // Other
      muted: '#142814',
      mutedForeground: '#55dd55',
      border: '#1f4f1f',
      destructive: '#ff3333',
    },
  },
} as const;

/**
 * Font families for each theme variant
 */
const THEME_FONTS = {
  base: "'Space Grotesk', system-ui, sans-serif",
  hacker: "'JetBrains Mono', monospace",
} as const;

/**
 * Computes modal text colors based on theme variant and color scheme.
 */
function getModalTextColors(colorScheme: 'light' | 'dark', variant: ThemeVariant) {
  const isDark = colorScheme === 'dark';
  const isHacker = variant === 'hacker';

  if (isHacker) {
    return {
      dim: isDark ? 'rgba(34, 204, 34, 0.5)' : 'rgba(26, 77, 26, 0.5)',
      secondary: isDark ? 'rgba(34, 204, 34, 0.7)' : 'rgba(26, 77, 26, 0.7)',
    };
  }

  return {
    dim: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
    secondary: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
  };
}

/**
 * Creates a RainbowKit theme based on color scheme and variant.
 */
export function createRainbowKitTheme(colorScheme: 'light' | 'dark', variant: ThemeVariant): Theme {
  const baseTheme = colorScheme === 'dark' ? darkTheme() : lightTheme();
  const fontFamily = THEME_FONTS[variant];
  const p = PALETTES[variant][colorScheme];
  const modalTextColors = getModalTextColors(colorScheme, variant);

  const colors = {
    // Accent - THE button background and text colors
    accentColor: p.accentColor,
    accentColorForeground: p.accentColorForeground,

    // Modal
    modalBackground: p.card,
    modalBorder: p.border,
    modalText: p.foreground,
    // Secondary text - computed based on theme for better visibility
    modalTextDim: modalTextColors.dim,
    modalTextSecondary: modalTextColors.secondary,

    // Close button
    closeButton: p.mutedForeground,
    closeButtonBackground: p.muted,

    // Action buttons (these are transparent overlays)
    actionButtonBorder: 'rgba(0, 0, 0, 0.04)',
    actionButtonBorderMobile: 'rgba(0, 0, 0, 0.06)',
    actionButtonSecondaryBackground: p.muted,

    // General borders
    generalBorder: p.border,
    generalBorderDim: p.muted,

    // Connect button (in navbar)
    connectButtonBackground: p.card,
    connectButtonBackgroundError: p.destructive,
    connectButtonInnerBackground: p.muted,
    connectButtonText: p.foreground,
    connectButtonTextError: '#ffffff',

    // Profile modal - these are OVERLAYS, not solid colors
    profileForeground: p.profileForeground,
    profileAction: p.profileAction,
    profileActionHover: p.profileActionHover,

    // Selection border
    selectedOptionBorder: p.accentColor,

    // Download cards
    downloadBottomCardBackground: p.card,
    downloadTopCardBackground: p.muted,

    // Menu
    menuItemBackground: p.muted,

    // Status colors
    error: p.destructive,
    standby: '#ffcc00',
  };

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...colors,
    },
    fonts: {
      ...baseTheme.fonts,
      body: fontFamily,
    },
    radii: {
      ...baseTheme.radii,
      actionButton: '8px',
      connectButton: '8px',
      menuButton: '8px',
      modal: '12px',
      modalMobile: '16px',
    },
  };
}
