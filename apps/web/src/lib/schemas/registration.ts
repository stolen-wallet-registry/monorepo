/**
 * Registration form validation schemas.
 *
 * Provides type-safe Zod schemas for the registration flow forms.
 */

import { z } from 'zod';
import { ethereumAddressSchema, optionalEthereumAddressSchema } from './address';

/**
 * Schema for the initial registration form.
 *
 * - registeree: The wallet being registered as stolen (required, validated address)
 * - relayer: Optional gas wallet for self-relay mode (empty string or valid address)
 */
export const initialFormSchema = z.object({
  registeree: ethereumAddressSchema,
  relayer: optionalEthereumAddressSchema,
});

/**
 * Input type for the form (before validation transforms).
 */
export type InitialFormInput = z.input<typeof initialFormSchema>;

/**
 * Output type for validated form values.
 */
export type InitialFormValues = z.output<typeof initialFormSchema>;

/**
 * Schema for self-relay form validation.
 *
 * Extends initial form with stricter relayer validation.
 */
export const selfRelayFormSchema = initialFormSchema.extend({
  relayer: ethereumAddressSchema, // Required in self-relay mode
});

export type SelfRelayFormValues = z.output<typeof selfRelayFormSchema>;
