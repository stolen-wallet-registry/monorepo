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

/**
 * A 65-byte ECDSA signature: 0x + 130 hex characters.
 *
 * Nothing else is a signature. A bare length cap of 500 accepted `"hello"`, and a relayer that
 * accepted it paid gas for a transaction that could only revert.
 */
const signatureHexSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid 65-byte signature');

/**
 * An unsigned decimal integer, safe to hand to `BigInt()`.
 *
 * The bound is uint256's digit count. A length cap alone let `"abc"` through, and `BigInt("abc")`
 * throws — inside the relayer's submit path, after the payload was accepted as well-formed.
 */
const decimalUintSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/, 'Expected a plain decimal integer');

/**
 * Signature over the wire schema.
 *
 * These field shapes are the contract this schema advertises to anything that decodes a
 * stream. They used to be bare length caps, with the real enforcement living a layer above in
 * apps/web's `signatureData.ts` — so the web app was safe and any other consumer trusting the
 * schema inherited none of it. The checks now live with the shape that describes them.
 */
export const SignatureOverTheWireSchema = z
  .object({
    keyRef: z.string().max(100),
    chainId: z.number().int().positive(),
    address: ethereumAddressSchema,
    value: signatureHexSchema,
    deadline: decimalUintSchema,
    nonce: decimalUintSchema,
    // Extended fields (optional for backward compatibility)
    /**
     * DECIMAL chain ID where the incident occurred — NOT a bytes32 hash, despite sharing a
     * name with `TransactionBatchOverTheWireSchema.reportedChainId`. The wallet contracts take
     * `uint64 reportedChainId` and the sender ships `BigInt(chainId).toString()`; only the
     * transaction flow hashes it into a bytes32 CAIP-2 reference. The previous comment here
     * claimed bytes32, and validating it as bytes32 would reject every relayed wallet
     * signature.
     */
    reportedChainId: decimalUintSchema.optional(),
    /** Unix timestamp when incident occurred (0 = unknown) */
    incidentTimestamp: decimalUintSchema.optional(),
    /**
     * Registration only: block number whose hash the signature committed to (anti-phishing
     * freshness control). Travels unsigned — the relayer submits it verbatim and the contract
     * recomputes `blockhash(windowBlock)` to check it against the signed hash.
     */
    windowBlock: decimalUintSchema.optional(),
    /** Registration only: `blockhash(windowBlock)`, the value actually signed. */
    windowBlockHash: bytes32Schema.optional(),
  })
  .strict()
  // Co-presence, at the schema layer rather than only in the web app. The relayer submits
  // `windowBlock` as calldata and the contract rebuilds the signed digest from
  // `windowBlockHash`; half a pair is a transaction that can only revert, after the gas.
  .refine((sig) => (sig.windowBlock === undefined) === (sig.windowBlockHash === undefined), {
    message: 'windowBlock and windowBlockHash must both be present or both be absent',
    path: ['windowBlock'],
  });

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

/**
 * Why a relayer is asking its partner to sign again.
 *
 * A closed enum rather than free text: the receiver picks a recovery path from this value,
 * and an open string would let a peer steer that choice with something unanticipated.
 * `window-closed` is strictly the more expensive recovery of the two (it restarts the
 * two-phase flow from the acknowledgement), so a peer gains nothing by claiming it.
 */
export const RESIGN_REASONS = ['signature-invalidated', 'window-closed'] as const;

/** Machine-readable reason on a {@link ResignRequestMessageSchema} payload. */
export type ResignReason = (typeof RESIGN_REASONS)[number];

/** Main parsed stream data schema */
export const ParsedStreamDataSchema = z
  .object({
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
    /**
     * Re-sign request only. Declared here as well because `readStreamData` validates every
     * inbound message against this schema first and it is `.strict()` — an unlisted key is
     * rejected before the per-protocol schema is ever consulted.
     */
    reason: z.enum(RESIGN_REASONS).optional(),
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

/**
 * Re-sign request sent via RESIGN_REQ.
 *
 * `reason` is REQUIRED. It is the only field the receiver acts on, and the recovery it
 * selects moves the partner's flow backwards — the one inbound message allowed to do that.
 * Making it mandatory means a request that arrives without a recognised reason fails the
 * per-protocol schema check and is dropped, rather than falling through to a guessed default.
 *
 * `message` is human-readable prose for logs only. Receivers must render their own copy from
 * `reason`: this string is peer-supplied and would otherwise be attacker-controlled text
 * displayed to a fraud victim mid-flow.
 */
export const ResignRequestMessageSchema = z
  .object({
    reason: z.enum(RESIGN_REASONS),
    success: z.boolean().optional(),
    message: z.string().max(1000).optional(),
  })
  .strict();

/** Derived types from protocol-specific schemas */
export type HandshakeMessage = z.infer<typeof HandshakeMessageSchema>;
export type WalletSignatureMessage = z.infer<typeof WalletSignatureMessageSchema>;
export type TxSignatureMessage = z.infer<typeof TxSignatureMessageSchema>;
export type ConfirmationMessage = z.infer<typeof ConfirmationMessageSchema>;
export type PaymentMessage = z.infer<typeof PaymentMessageSchema>;
export type ResignRequestMessage = z.infer<typeof ResignRequestMessageSchema>;

/** Union of all protocol-specific message types for send-side type safety */
export type StreamMessage =
  | HandshakeMessage
  | WalletSignatureMessage
  | TxSignatureMessage
  | ConfirmationMessage
  | PaymentMessage
  | ResignRequestMessage;

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
  [PROTOCOLS.RESIGN_REQ]: ResignRequestMessageSchema,
  // The reply to RESIGN_REQ. Deliberately the plain confirmation shape: `success` is the whole
  // decision, and `message` is log prose the relayer must not render — see PROTOCOLS.
  [PROTOCOLS.RESIGN_ACK]: ConfirmationMessageSchema,
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
