/**
 * EIP-712 signature validation schemas.
 *
 * Provides type-safe Zod schemas for hex strings and signatures.
 */

import { z } from 'zod';
import type { Hex, Hash } from '@/lib/types/ethereum';

/**
 * Schema for validating hex strings (0x prefixed).
 */
export const hexStringSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]+$/, 'Must be a valid hex string starting with 0x');

/**
 * Schema for validating EIP-712 signatures.
 *
 * - Must be 65 bytes (130 hex chars + 0x prefix = 132 chars)
 * - Format: r (32 bytes) + s (32 bytes) + v (1 byte)
 */
export const signatureSchema = hexStringSchema.refine((val) => val.length === 132, {
  message: 'Signature must be 65 bytes (132 hex characters including 0x prefix)',
}) as z.ZodType<Hex>;

/**
 * Schema for validating transaction hashes.
 *
 * - Must be 32 bytes (64 hex chars + 0x prefix = 66 chars)
 */
export const txHashSchema = hexStringSchema.refine((val) => val.length === 66, {
  message: 'Transaction hash must be 32 bytes (66 hex characters including 0x prefix)',
}) as z.ZodType<Hash>;

/**
 * Type for a validated signature.
 */
export type Signature = z.infer<typeof signatureSchema>;

/**
 * Type for a validated transaction hash.
 */
export type TxHash = z.infer<typeof txHashSchema>;
