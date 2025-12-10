import { darkTheme, lightTheme, type Theme } from '@rainbow-me/rainbowkit';

import type { ThemeVariant } from '@/providers';

/**
 * Theme color definitions for RainbowKit
 * RainbowKit doesn't support OKLCH, so we use hex colors
 */
const THEME_COLORS = {
  base: {
    light: {
      accentColor: '#000000',
      accentColorForeground: '#ffffff',
      modalBackground: '#ffffff',
      modalText: '#000000',
      modalTextSecondary: '#666666',
      closeButton: '#000000',
      closeButtonBackground: '#f0f0f0',
      actionButtonBorder: '#000000',
      actionButtonBorderMobile: '#000000',
      actionButtonSecondaryBackground: '#f5f5f5',
      generalBorder: '#d9d9d9',
      generalBorderDim: '#e5e5e5',
      connectButtonBackground: '#ffffff',
      connectButtonBackgroundError: '#ff4444',
      connectButtonInnerBackground: '#f5f5f5',
      connectButtonText: '#000000',
      connectButtonTextError: '#ffffff',
      profileForeground: '#f5f5f5',
      selectedOptionBorder: '#000000',
      downloadBottomCardBackground: '#ffffff',
      downloadTopCardBackground: '#f5f5f5',
      profileAction: '#000000',
      profileActionHover: '#333333',
      menuItemBackground: '#f5f5f5',
      error: '#ff4444',
      standby: '#ffcc00',
    },
    dark: {
      accentColor: '#ffffff',
      accentColorForeground: '#000000',
      modalBackground: '#000000',
      modalText: '#ffffff',
      modalTextSecondary: '#999999',
      closeButton: '#ffffff',
      closeButtonBackground: '#1a1a1a',
      actionButtonBorder: '#ffffff',
      actionButtonBorderMobile: '#ffffff',
      actionButtonSecondaryBackground: '#1a1a1a',
      generalBorder: '#333333',
      generalBorderDim: '#262626',
      connectButtonBackground: '#000000',
      connectButtonBackgroundError: '#ff4444',
      connectButtonInnerBackground: '#1a1a1a',
      connectButtonText: '#ffffff',
      connectButtonTextError: '#ffffff',
      profileForeground: '#1a1a1a',
      selectedOptionBorder: '#ffffff',
      downloadBottomCardBackground: '#000000',
      downloadTopCardBackground: '#1a1a1a',
      profileAction: '#ffffff',
      profileActionHover: '#cccccc',
      menuItemBackground: '#1a1a1a',
      error: '#ff6666',
      standby: '#ffcc00',
    },
  },
  hacker: {
    light: {
      accentColor: '#1a5c1a', // Dark green
      accentColorForeground: '#f0fff0',
      modalBackground: '#f0fff0',
      modalText: '#1a3d1a',
      modalTextSecondary: '#4a7a4a',
      closeButton: '#1a5c1a',
      closeButtonBackground: '#d0f0d0',
      actionButtonBorder: '#1a5c1a',
      actionButtonBorderMobile: '#1a5c1a',
      actionButtonSecondaryBackground: '#e0ffe0',
      generalBorder: '#8fc98f',
      generalBorderDim: '#c0e0c0',
      connectButtonBackground: '#f0fff0',
      connectButtonBackgroundError: '#ff4444',
      connectButtonInnerBackground: '#e0ffe0',
      connectButtonText: '#1a5c1a',
      connectButtonTextError: '#ffffff',
      profileForeground: '#e0ffe0',
      selectedOptionBorder: '#1a5c1a',
      downloadBottomCardBackground: '#f0fff0',
      downloadTopCardBackground: '#e0ffe0',
      profileAction: '#1a5c1a',
      profileActionHover: '#2a7c2a',
      menuItemBackground: '#e0ffe0',
      error: '#cc3333',
      standby: '#8fcc00',
    },
    dark: {
      accentColor: '#00ff00', // Neon green
      accentColorForeground: '#000a00',
      modalBackground: '#0a1a0a',
      modalText: '#00ff00',
      modalTextSecondary: '#00aa00',
      closeButton: '#00ff00',
      closeButtonBackground: '#0f2a0f',
      actionButtonBorder: '#00ff00',
      actionButtonBorderMobile: '#00ff00',
      actionButtonSecondaryBackground: '#0f2a0f',
      generalBorder: '#005500',
      generalBorderDim: '#003300',
      connectButtonBackground: '#0a1a0a',
      connectButtonBackgroundError: '#550000',
      connectButtonInnerBackground: '#0f2a0f',
      connectButtonText: '#00ff00',
      connectButtonTextError: '#ff6666',
      profileForeground: '#0f2a0f',
      selectedOptionBorder: '#00ff00',
      downloadBottomCardBackground: '#0a1a0a',
      downloadTopCardBackground: '#0f2a0f',
      profileAction: '#00ff00',
      profileActionHover: '#00cc00',
      menuItemBackground: '#0f2a0f',
      error: '#ff3333',
      standby: '#aaff00',
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
 * Creates a RainbowKit theme based on color scheme and variant
 */
export function createRainbowKitTheme(colorScheme: 'light' | 'dark', variant: ThemeVariant): Theme {
  const baseTheme = colorScheme === 'dark' ? darkTheme() : lightTheme();
  const colors = THEME_COLORS[variant][colorScheme];
  const fontFamily = THEME_FONTS[variant];

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...colors,
    },
    fonts: {
      body: fontFamily,
    },
    radii: {
      ...baseTheme.radii,
      // Slightly sharper corners for a more modern look
      actionButton: '8px',
      connectButton: '8px',
      menuButton: '8px',
      modal: '12px',
      modalMobile: '16px',
    },
  };
}
