/**
 * Shared constants for ENS hooks.
 */

/**
 * Query options for ENS resolution.
 * Aggressive caching since ENS names rarely change.
 */
export const ENS_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
  retry: 1, // Single retry on failure
  retryDelay: 1000, // 1 second delay
} as const;
