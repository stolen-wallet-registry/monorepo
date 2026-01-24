/**
 * P2P type definitions for libp2p stream data.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schemas for P2P Stream Data Validation
// ═══════════════════════════════════════════════════════════════════════════

/** Ethereum address regex - 0x followed by 40 hex characters */
const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

/** Transaction hash regex - 0x followed by 64 hex characters */
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

/** Signature over the wire schema */
export const SignatureOverTheWireSchema = z
  .object({
    keyRef: z.string().max(100),
    chainId: z.number().int().positive(),
    address: ethereumAddressSchema,
    value: z.string().max(500), // Signatures are ~130 chars
    deadline: z.string().max(50), // BigInt as string
    nonce: z.string().max(50), // BigInt as string
  })
  .strict();

/** Form state over the wire schema */
export const FormStateOverTheWireSchema = z
  .object({
    registeree: ethereumAddressSchema.optional(),
    relayer: ethereumAddressSchema.optional(),
  })
  .strict();

/** Registration state over the wire schema */
export const RegistrationStateOverTheWireSchema = z
  .object({
    currentStep: z.string().max(50).optional(),
    currentMethod: z.string().max(50).optional(),
  })
  .strict();

/** P2P state subset schema (only allow safe fields) */
export const P2PStateOverTheWireSchema = z
  .object({
    peerId: z.string().max(100).optional(),
    partnerPeerId: z.string().max(100).optional(),
    connectedToPeer: z.boolean().optional(),
  })
  .strict();

/** Main parsed stream data schema */
export const ParsedStreamDataSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
    p2p: P2PStateOverTheWireSchema.optional(),
    form: FormStateOverTheWireSchema.optional(),
    state: RegistrationStateOverTheWireSchema.optional(),
    signature: SignatureOverTheWireSchema.optional(),
    hash: txHashSchema.optional(),
    /** Bridge message ID for cross-chain explorer links (e.g., Hyperlane messageId) */
    messageId: txHashSchema.optional(),
    /** Chain ID where the transaction was submitted (for correct explorer links in cross-chain P2P) */
    txChainId: z.number().int().positive().optional(),
  })
  .strict(); // Reject unknown keys for security

// ═══════════════════════════════════════════════════════════════════════════
// TypeScript Types (derived from Zod schemas)
// ═══════════════════════════════════════════════════════════════════════════

/** Signature data transmitted over P2P streams */
export type SignatureOverTheWire = z.infer<typeof SignatureOverTheWireSchema>;

/** Form state transmitted over P2P streams */
export type FormStateOverTheWire = z.infer<typeof FormStateOverTheWireSchema>;

/** Registration state transmitted over P2P streams */
export type RegistrationStateOverTheWire = z.infer<typeof RegistrationStateOverTheWireSchema>;

/** P2P state subset transmitted over streams */
export type P2PStateOverTheWire = z.infer<typeof P2PStateOverTheWireSchema>;

/** Data structure for P2P stream messages */
export type ParsedStreamData = z.infer<typeof ParsedStreamDataSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// Relay Configuration Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Relay server configuration.
 */
export interface RelayConfig {
  /** Multiaddr of the relay server */
  multiaddr: string;
  /** Whether this is a development relay */
  isDev?: boolean;
}

/**
 * Error thrown when relay server configuration is missing.
 */
export class RelayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelayConfigurationError';
  }
}
