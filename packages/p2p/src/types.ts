/**
 * P2P type definitions for libp2p stream data.
 */

import { z } from 'zod';

import { PROTOCOLS } from './protocols';

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schemas for P2P Stream Data Validation
// ═══════════════════════════════════════════════════════════════════════════

/** Ethereum address regex - 0x followed by 40 hex characters */
const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

/** bytes32 hex string (0x + 64 hex chars) — shared base for tx hashes, data hashes, chain IDs */
const bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid bytes32');

/** Transaction hash — alias for bytes32 with domain-specific error message */
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
    // Extended fields (optional for backward compatibility)
    /** CAIP-2 bytes32 hash of chain where incident occurred */
    reportedChainId: z.string().max(66).optional(), // bytes32 hex string
    /** Unix timestamp when incident occurred (0 = unknown) */
    incidentTimestamp: z.string().max(50).optional(), // BigInt as string
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

/** Transaction batch data transmitted over P2P for transaction registration relay */
export const TransactionBatchOverTheWireSchema = z
  .object({
    /** keccak256(abi.encode(txHashes, chainIds)) */
    dataHash: bytes32Schema,
    /** CAIP-2 chain ID as bytes32 hash */
    reportedChainId: bytes32Schema,
    /** Number of transactions in the batch */
    transactionCount: z.number().int().positive().max(100),
    /** Sorted transaction hashes for contract call */
    transactionHashes: z.array(txHashSchema).max(100),
    /** Parallel CAIP-2 chain ID hashes (one per tx) */
    chainIdHashes: z.array(bytes32Schema).max(100),
  })
  .strict()
  .refine((d) => d.transactionHashes.length === d.transactionCount, {
    message: 'transactionHashes length must equal transactionCount',
  })
  .refine((d) => d.chainIdHashes.length === d.transactionCount, {
    message: 'chainIdHashes length must equal transactionCount',
  });

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
    /** Transaction batch data for P2P transaction registration relay */
    transactionBatch: TransactionBatchOverTheWireSchema.optional(),
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

/** Transaction batch data transmitted over P2P streams */
export type TransactionBatchOverTheWire = z.infer<typeof TransactionBatchOverTheWireSchema>;

/** Data structure for P2P stream messages (wire format union) */
export type ParsedStreamData = z.infer<typeof ParsedStreamDataSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// Protocol-Specific Message Schemas (Zod)
// ═══════════════════════════════════════════════════════════════════════════
//
// Narrow schemas for what each protocol category actually sends/receives.
// All are structurally compatible with ParsedStreamData (the wire format).
// Types derived via z.infer<> — use StreamMessage union on send side,
// ParsedStreamData superset on receive side.

/** Handshake message exchanged during CONNECT protocol */
export const HandshakeMessageSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
    p2p: P2PStateOverTheWireSchema.optional(),
    form: FormStateOverTheWireSchema.optional(),
  })
  .strict();

/** Wallet signature message sent via ACK_SIG / REG_SIG */
export const WalletSignatureMessageSchema = z
  .object({
    signature: SignatureOverTheWireSchema,
    form: FormStateOverTheWireSchema.optional(),
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

/** Transaction signature + batch data sent via TX_ACK_SIG / TX_REG_SIG */
export const TxSignatureMessageSchema = z
  .object({
    signature: SignatureOverTheWireSchema,
    transactionBatch: TransactionBatchOverTheWireSchema,
    form: FormStateOverTheWireSchema.optional(),
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

/** Confirmation/receipt message sent via *_REC protocols */
export const ConfirmationMessageSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

/** Payment notification sent via *_PAY protocols */
export const PaymentMessageSchema = z
  .object({
    hash: txHashSchema.optional(),
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
    messageId: txHashSchema.optional(),
    txChainId: z.number().int().positive().optional(),
  })
  .strict();

/** Derived types from protocol-specific schemas */
export type HandshakeMessage = z.infer<typeof HandshakeMessageSchema>;
export type WalletSignatureMessage = z.infer<typeof WalletSignatureMessageSchema>;
export type TxSignatureMessage = z.infer<typeof TxSignatureMessageSchema>;
export type ConfirmationMessage = z.infer<typeof ConfirmationMessageSchema>;
export type PaymentMessage = z.infer<typeof PaymentMessageSchema>;

/** Union of all protocol-specific message types for send-side type safety */
export type StreamMessage =
  | HandshakeMessage
  | WalletSignatureMessage
  | TxSignatureMessage
  | ConfirmationMessage
  | PaymentMessage;

/** Protocol-to-schema mapping for validation at receive sites */
export const PROTOCOL_SCHEMAS: Record<string, z.ZodType> = {
  [PROTOCOLS.CONNECT]: HandshakeMessageSchema,
  [PROTOCOLS.ACK_SIG]: WalletSignatureMessageSchema,
  [PROTOCOLS.ACK_REC]: ConfirmationMessageSchema,
  [PROTOCOLS.ACK_PAY]: PaymentMessageSchema,
  [PROTOCOLS.REG_SIG]: WalletSignatureMessageSchema,
  [PROTOCOLS.REG_REC]: ConfirmationMessageSchema,
  [PROTOCOLS.REG_PAY]: PaymentMessageSchema,
  [PROTOCOLS.TX_ACK_SIG]: TxSignatureMessageSchema,
  [PROTOCOLS.TX_ACK_REC]: ConfirmationMessageSchema,
  [PROTOCOLS.TX_ACK_PAY]: PaymentMessageSchema,
  [PROTOCOLS.TX_REG_SIG]: TxSignatureMessageSchema,
  [PROTOCOLS.TX_REG_REC]: ConfirmationMessageSchema,
  [PROTOCOLS.TX_REG_PAY]: PaymentMessageSchema,
};

// ═══════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════

/** Narrow to wallet signature message (has signature, no transactionBatch) */
export function isWalletSignatureMessage(
  data: ParsedStreamData
): data is ParsedStreamData & { signature: SignatureOverTheWire } {
  return data.signature !== undefined && data.transactionBatch === undefined;
}

/** Narrow to transaction signature message (has both signature and transactionBatch) */
export function isTxSignatureMessage(data: ParsedStreamData): data is ParsedStreamData & {
  signature: SignatureOverTheWire;
  transactionBatch: TransactionBatchOverTheWire;
} {
  return data.signature !== undefined && data.transactionBatch !== undefined;
}

/** Narrow to payment notification (has hash) */
export function isPaymentMessage(
  data: ParsedStreamData
): data is ParsedStreamData & { hash: string } {
  return data.hash !== undefined;
}

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
