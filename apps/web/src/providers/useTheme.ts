import { useContext } from 'react';

import { ThemeProviderContext } from './ThemeProviderContext';
import { logger } from '@/lib/logger';

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    logger.ui.error('useTheme called outside ThemeProvider!');
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
