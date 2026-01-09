/**
 * Registry utilities for querying and interpreting stolen wallet registry data.
 *
 * @example
 * ```ts
 * import {
 *   queryRegistryStatus,
 *   getResultStatus,
 *   type RegistryStatusResult,
 * } from '@swr/ui';
 *
 * const result = await queryRegistryStatus(client, address, contractAddr, abi);
 * const status = getResultStatus(result); // 'registered' | 'pending' | 'not-found'
 * ```
 */

// Types
export type {
  RegistrationData,
  AcknowledgementData,
  RegistryStatusResult,
  ResultStatus,
} from './types';

// Query functions
export { queryRegistryStatus, queryRegistryStatusSimple } from './query';

// Interpretation utilities
export {
  getResultStatus,
  getStatusLabel,
  getStatusDescription,
  formatBlockAsTime,
  isWalletCompromised,
} from './interpret';
