/**
 * Shared indexer configuration.
 */

export const INDEXER_URL: string = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:42069';

if (import.meta.env.PROD && !import.meta.env.VITE_INDEXER_URL) {
  console.warn('[indexer] VITE_INDEXER_URL not set, using localhost fallback');
}
