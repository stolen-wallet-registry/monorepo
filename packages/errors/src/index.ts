/**
 * @swr/errors - Contract error decoding and user-friendly messages.
 *
 * Provides standardized error handling for SWR contract interactions.
 * Decodes contract custom error selectors and returns actionable messages.
 *
 * @example
 * ```typescript
 * import { decodeContractError, sanitizeErrorMessage } from '@swr/errors';
 *
 * // Decode a specific contract error
 * const message = decodeContractError('custom error 0xec5c97a6');
 * // "Your registration window has expired. Please start the registration process again from the beginning."
 *
 * // Sanitize any error for display
 * try {
 *   await submitTransaction();
 * } catch (error) {
 *   const userMessage = sanitizeErrorMessage(error);
 *   showToast(userMessage);
 * }
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type { ContractErrorInfo } from './selectors';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR SELECTORS
// ═══════════════════════════════════════════════════════════════════════════

export { CONTRACT_ERROR_MAP, CONTRACT_ERROR_SELECTORS } from './selectors';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR DECODING
// ═══════════════════════════════════════════════════════════════════════════

export { decodeContractError, getContractErrorInfo, sanitizeErrorMessage } from './decode';
