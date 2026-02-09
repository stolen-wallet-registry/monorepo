/**
 * Browser-related utilities.
 */

/**
 * Get browser language code (e.g., 'en' from 'en-US').
 * Falls back to 'en' if not available (e.g., SSR).
 */
export function getBrowserLanguage(): string {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage;
  const primary = lang?.split('-')[0];
  return primary ? primary.toLowerCase() : 'en';
}
