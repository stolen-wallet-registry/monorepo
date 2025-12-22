/**
 * Ethereum address validation schemas.
 *
 * Provides type-safe Zod schemas for address validation with viem integration.
 */

import { z } from 'zod';
import { isAddress, getAddress } from 'viem';
import type { Address } from '@/lib/types/ethereum';

/**
 * Schema for validating and checksumming Ethereum addresses.
 *
 * - Validates using viem's isAddress
 * - Transforms to checksummed format via getAddress
 * - Output type is Address for compatibility with viem/wagmi
 */
export const ethereumAddressSchema = z
  .string()
  .refine((val) => isAddress(val), { message: 'Invalid Ethereum address' })
  .transform((val) => getAddress(val) as Address);

/**
 * Schema for optional Ethereum address (empty string or valid address).
 *
 * Use for optional fields like relayer in self-relay mode.
 */
export const optionalEthereumAddressSchema = z.union([z.literal(''), ethereumAddressSchema]);

/**
 * Type for a validated Ethereum address.
 */
export type EthereumAddress = z.output<typeof ethereumAddressSchema>;
