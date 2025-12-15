# 01: libp2p P2P Relay Architecture

This document describes the peer-to-peer signature relay infrastructure used for helper-assisted wallet registration, built on libp2p 3.x.

---

## Overview

The P2P relay system enables users with compromised (drained) wallets to register them as stolen by relaying signatures to a helper who pays the gas fees. This solves the "no funds" problem where a user cannot pay for their own registration.

### Why P2P?

1. **NAT Traversal** - Browser clients behind NATs can communicate via relay
2. **No Centralized Server** - Signatures flow directly between browsers (~85% of connections via WebRTC)
3. **No Trust Required** - Signatures are cryptographically verified on-chain
4. **Cost Efficiency** - Public relay infrastructure eliminates hosting costs

---

## Transport Stack

libp2p 3.x provides multiple transport options for browser clients:

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

transports: [
  circuitRelayTransport(),  // For NAT traversal via relay
  webRTC(),                 // Direct browser-to-browser (primary)
  webRTCDirect(),           // Direct WebRTC without signaling
  webTransport(),           // HTTP/3 based transport
  webSockets(),             // Fallback for Safari/older browsers
],
```

### Connection Priority

| Transport            | Use Case                                  | Browser Support     |
| -------------------- | ----------------------------------------- | ------------------- |
| **WebRTC**           | Direct P2P after relay-assisted signaling | All modern browsers |
| **Circuit Relay V2** | NAT traversal, fallback                   | All browsers        |
| **WebSockets**       | Safari fallback (no WebRTC support)       | All browsers        |
| **WebTransport**     | Modern HTTP/3 connections                 | Chrome/Edge         |

### Listen Addresses

```typescript
addresses: {
  listen: ['/p2p-circuit', '/webrtc'],
},
```

- `/p2p-circuit` - Listen for connections via circuit relay
- `/webrtc` - Listen for direct WebRTC connections

---

## Protocol Stack

### Stream Multiplexing & Encryption

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

connectionEncrypters: [noise()],    // Noise protocol encryption
streamMuxers: [yamux()],           // Yamux stream multiplexer (replaces mplex in 3.x)
```

### Services

```typescript
services: {
  identify: identify(),    // Peer identification
  dcutr: dcutr(),         // Direct Connection Upgrade through Relay
  ping: ping(),           // Connection health checks
},
```

**DCUtR (Direct Connection Upgrade through Relay):**
After initial connection via relay, DCUtR attempts to establish a direct WebRTC connection, upgrading the "limited" relay connection to a direct peer-to-peer connection.

---

## Custom SWR Protocols

Eight protocols handle different stages of the registration relay:

```typescript
// File: apps/web/src/lib/p2p/protocols.ts

export const PROTOCOLS = {
  /** Initial connection handshake */
  CONNECT: '/swr/connected/1.0.0',

  /** Acknowledgement signature transfer (registeree → relayer) */
  ACK_SIG: '/swr/acknowledgement/signature/1.0.0',

  /** Acknowledgement signature received confirmation (relayer → registeree) */
  ACK_REC: '/swr/acknowledgement/signature/1.0.0/received',

  /** Acknowledgement payment notification (relayer → registeree) */
  ACK_PAY: '/swr/acknowledgement/payment/1.0.0',

  /** Registration signature transfer (registeree → relayer) */
  REG_SIG: '/swr/register/signature/1.0.0',

  /** Registration signature received confirmation (relayer → registeree) */
  REG_REC: '/swr/register/signature/1.0.0/received',

  /** Registration payment notification (relayer → registeree) */
  REG_PAY: '/swr/register/payment/1.0.0',
} as const;
```

### Protocol Naming Convention

Pattern: `/swr/{action}/{type}/{version}[/received]`

- `swr` - Stolen Wallet Registry namespace
- `{action}` - connected, acknowledgement, register
- `{type}` - signature, payment
- `{version}` - Semantic version (1.0.0)
- `/received` - Confirmation suffix

---

## Message Format

All P2P messages use a typed JSON structure validated by Zod:

```typescript
// File: apps/web/src/lib/p2p/types.ts

export interface ParsedStreamData {
  /** Whether the operation succeeded */
  success?: boolean;
  /** Human-readable message */
  message?: string;
  /** P2P connection state */
  p2p?: {
    peerId?: string;
    partnerPeerId?: string;
    connectedToPeer?: boolean;
  };
  /** Form values */
  form?: {
    registeree?: `0x${string}`;
    relayer?: `0x${string}`;
  };
  /** Registration flow state */
  state?: {
    currentStep?: string;
    currentMethod?: string;
  };
  /** Signature data for relay */
  signature?: SignatureOverTheWire;
  /** Transaction hash after submission */
  hash?: `0x${string}`;
}
```

### Signature Over-the-Wire Format

```typescript
// File: apps/web/src/lib/p2p/types.ts

export interface SignatureOverTheWire {
  /** Signature key reference (AcknowledgementOfRegistry | Registration) */
  keyRef: string;
  /** Chain ID where signature is valid */
  chainId: number;
  /** Signer's Ethereum address */
  address: `0x${string}`;
  /** The signature value */
  value: string;
  /** Deadline as string (bigint serialized) */
  deadline: string;
  /** Nonce as string (bigint serialized) */
  nonce: string;
}
```

---

## Zod Schema Validation

All incoming stream data is validated against strict Zod schemas:

```typescript
// File: apps/web/src/lib/p2p/types.ts

/** Ethereum address regex - 0x followed by 40 hex characters */
const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

/** Transaction hash regex - 0x followed by 64 hex characters */
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

/** Signature over the wire schema */
export const SignatureOverTheWireSchema = z
  .object({
    keyRef: z.string().max(100),
    chainId: z.number().int().positive(),
    address: ethereumAddressSchema,
    value: z.string().max(500), // Signatures ~130 chars
    deadline: z.string().max(50), // BigInt as string
    nonce: z.string().max(50), // BigInt as string
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
  })
  .strict(); // Reject unknown keys for security
```

---

## Connection Lifecycle

### Node Setup

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

export async function setup(handlers: ProtocolHandler[]): Promise<{ libp2p: Libp2p }> {
  logger.p2p.info('Creating libp2p node');

  const libp2p = await createLibp2p(libp2pDefaults());

  // Register protocol handlers
  for (const h of handlers) {
    await libp2p.handle(h.protocol, h.streamHandler.handler, h.streamHandler.options);
  }

  logger.p2p.info('libp2p node created', {
    peerId: libp2p.peerId.toString(),
    multiaddrs: libp2p.getMultiaddrs().map((ma) => ma.toString()),
  });

  return { libp2p };
}
```

### Establishing Connection

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

export const getPeerConnection = async ({
  libp2p,
  remotePeerId,
}: {
  libp2p: Libp2p;
  remotePeerId: string;
}): Promise<Connection> => {
  // Check for existing connection
  const peerId = peerIdFromString(remotePeerId);
  let connection = libp2p.getConnections().find((conn) => conn.remotePeer.equals(peerId));

  if (connection) {
    return connection; // Reuse existing
  }

  // Build multiaddrs for circuit relay connection
  const multiaddrs = libp2p.getMultiaddrs().map((ma) => {
    // WebRTC connections use different circuit relay path
    if (WebRTC.matches(ma)) {
      return ma.decapsulateCode(290).encapsulate(`/p2p-circuit/webrtc/p2p/${peerId.toString()}`);
    } else {
      return ma.decapsulateCode(290).encapsulate(`/p2p-circuit/p2p/${peerId.toString()}`);
    }
  });

  // Save peer info and dial
  await libp2p.peerStore.save(peerId, { multiaddrs });
  connection = await libp2p.dial(multiaddrs);

  return connection;
};
```

### Sending Stream Data

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

export const passStreamData = async ({
  streamData = {},
  connection,
  protocols,
}: {
  streamData?: ParsedStreamData;
  connection: Connection;
  protocols: string[];
}): Promise<void> => {
  // Circuit relay connections are "limited" - must explicitly allow streams
  const stream = await connection.newStream(protocols, {
    runOnLimitedConnection: true,
  });

  // Encode with length prefix (libp2p 3.x pattern)
  const data = uint8ArrayFromString(JSON.stringify(streamData));
  const encoded = lp.encode.single(data);
  stream.send(encoded.subarray());

  await stream.close();
};
```

### Reading Stream Data

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

export const readStreamData = async (stream: Stream): Promise<ParsedStreamData> => {
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  // Decode length-prefixed stream
  for await (const chunk of lp.decode(stream)) {
    const bytes = chunk instanceof Uint8Array ? chunk : chunk.subarray();

    // Size limit check (DoS prevention)
    totalSize += bytes.length;
    if (totalSize > MAX_STREAM_SIZE_BYTES) {
      // 100KB
      throw new StreamDataValidationError(
        `Stream data exceeds maximum size limit of ${MAX_STREAM_SIZE_BYTES} bytes`
      );
    }

    chunks.push(bytes);
  }

  // Concatenate and parse
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const jsonString = uint8ArrayToString(combined);

  // Safe JSON parse (prevents prototype pollution)
  const rawData = safeJsonParse(jsonString);

  // Zod validation
  const parseResult = ParsedStreamDataSchema.safeParse(rawData);
  if (!parseResult.success) {
    throw new StreamDataValidationError(
      `Stream data validation failed: ${parseResult.error.issues.map((e) => e.message).join(', ')}`
    );
  }

  return parseResult.data as ParsedStreamData;
};
```

---

## Security Features

### Size Limits

```typescript
// File: apps/web/src/lib/p2p/types.ts

/** Maximum size of incoming P2P stream data (100KB) */
export const MAX_STREAM_SIZE_BYTES = 100 * 1024;
```

Prevents DoS attacks via oversized messages.

### Safe JSON Parsing

```typescript
// File: apps/web/src/lib/p2p/types.ts

export const DANGEROUS_JSON_KEYS = ['__proto__', 'constructor', 'prototype'];

export function safeJsonParse(jsonString: string): unknown {
  return JSON.parse(jsonString, (key, value) => {
    if (DANGEROUS_JSON_KEYS.includes(key)) {
      return undefined; // Strip dangerous keys
    }
    return value;
  });
}
```

Prevents prototype pollution attacks.

### Schema Validation

```typescript
// Strict schemas reject unknown keys
.strict();  // On all Zod schemas
```

Prevents injection of unexpected fields.

### Connection Gating (Production)

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

connectionGater: {
  denyDialMultiaddr: (ma) => {
    if (import.meta.env.PROD) {
      const addr = ma.toString();
      // Block localhost/private networks in production
      if (
        addr.includes('/ip4/127.') ||
        addr.includes('/ip4/0.0.0.0') ||
        addr.includes('/ip4/10.') ||
        addr.includes('/ip4/192.168.') ||
        addr.includes('/ip6/::1')
      ) {
        return true;  // Deny
      }
    }
    return false;  // Allow
  },
},
```

---

## Hooks Architecture

### useP2PConnection

Base hook for P2P connection management:

```typescript
// File: apps/web/src/hooks/useP2PConnection.ts

export interface UseP2PConnectionResult {
  node: Libp2p | null;
  connection: Connection | null;
  peerId: string | null;
  partnerPeerId: string | null;
  isConnected: boolean;
  isInitializing: boolean;
  isInitialized: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  connect: (remotePeerId: string) => Promise<Connection>;
  disconnect: () => Promise<void>;
  send: (protocols: string[], data: ParsedStreamData) => Promise<void>;
  shutdown: () => Promise<void>;
  readStream: typeof readStreamData;
}

export function useP2PConnection(options: UseP2PConnectionOptions = {}) {
  const { autoInit = false, handlers = [], onConnected, onDisconnected, onData } = options;

  const nodeRef = useRef<Libp2p | null>(null);
  const connectionRef = useRef<Connection | null>(null);

  // ... implementation
}
```

### useP2PSignatureRelay

Higher-level hook for signature relay operations:

```typescript
// File: apps/web/src/hooks/useP2PSignatureRelay.ts

export type P2PRole = 'registeree' | 'relayer';

export interface UseP2PSignatureRelayResult extends Omit<UseP2PConnectionResult, 'send'> {
  role: P2PRole;
  sendAckSignature: (signature: SignatureOverTheWire) => Promise<void>;
  sendRegSignature: (signature: SignatureOverTheWire) => Promise<void>;
  sendAckTxHash: (hash: `0x${string}`) => Promise<void>;
  sendRegTxHash: (hash: `0x${string}`) => Promise<void>;
  confirmAckReceived: () => Promise<void>;
  confirmRegReceived: () => Promise<void>;
  sendConnectHandshake: () => Promise<void>;
}
```

---

## P2P Store

Zustand store for P2P connection state:

```typescript
// File: apps/web/src/stores/p2pStore.ts

export type P2PConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface P2PState {
  peerId: string | null;
  partnerPeerId: string | null;
  connectedToPeer: boolean;
  connectionStatus: P2PConnectionStatus;
  errorMessage: string | null;
  isInitialized: boolean;
}

export interface P2PActions {
  setPeerId: (peerId: string) => void;
  setPartnerPeerId: (peerId: string) => void;
  setConnectedToPeer: (connected: boolean) => void;
  setConnectionStatus: (status: P2PConnectionStatus, errorMessage?: string) => void;
  setInitialized: (initialized: boolean) => void;
  reset: () => void;
}
```

**Persistence Note:**
The store persists `peerId` and `partnerPeerId` across refreshes, but `connectionStatus`, `errorMessage`, and `isInitialized` are reset to initial values. The libp2p node needs re-initialization each session.

---

## Complete Signature Relay Flow

### Flow Diagram

```
REGISTEREE                                    RELAYER
(User with stolen wallet)                     (Helper with funds)
────────────────────────                      ─────────────────────

1. INITIALIZATION
   ┌─────────────────────┐                    ┌─────────────────────┐
   │ createLibp2p()      │                    │ createLibp2p()      │
   │ ↓                   │                    │ ↓                   │
   │ Register handlers   │                    │ Register handlers   │
   │ ↓                   │                    │ ↓                   │
   │ Get peerId          │                    │ Get peerId          │
   │ (12D3KooW...)       │                    │ (12D3KooW...)       │
   └─────────────────────┘                    └─────────────────────┘

2. PEER EXCHANGE (out-of-band)
   Display peerId ──────────────────────────→ Enter registeree's peerId

3. CONNECTION
   ┌─────────────────────┐
   │ Relayer dials       │←─────────────────── getPeerConnection()
   │ registeree via      │                    │ (via circuit relay)
   │ circuit relay       │                    │
   └─────────────────────┘                    └─────────────────────┘

4. HANDSHAKE (CONNECT protocol)
   ┌─────────────────────┐     CONNECT        ┌─────────────────────┐
   │ Receive handshake   │←──────────────────│ Send CONNECT with   │
   │ Update form with    │                    │ relayer address     │
   │ registeree address  │                    │                     │
   │                     │                    │                     │
   │ Send response with  │──────────────────→│ Receive, update     │
   │ registeree addr     │     CONNECT        │ partnerPeerId       │
   └─────────────────────┘                    └─────────────────────┘

5. ACKNOWLEDGEMENT PHASE
   ┌─────────────────────┐     ACK_SIG        ┌─────────────────────┐
   │ Sign ACK message    │                    │                     │
   │ (EIP-712)           │                    │                     │
   │ ↓                   │                    │                     │
   │ Send signature      │──────────────────→│ Receive signature   │
   └─────────────────────┘                    │ Store in storage    │
                                              │ ↓                   │
                                              │ Validate signature  │
                                              │ ↓                   │
   ┌─────────────────────┐     ACK_REC        │ Send confirmation   │
   │ Receive confirmation│←──────────────────│                     │
   └─────────────────────┘                    │                     │
                                              │ Submit ACK tx       │
                                              │ ↓                   │
   ┌─────────────────────┐     ACK_PAY        │ Wait for confirm    │
   │ Receive tx hash     │←──────────────────│ ↓                   │
   │ Store in store      │                    │ Send tx hash        │
   └─────────────────────┘                    └─────────────────────┘

6. GRACE PERIOD (both wait ~1-4 minutes)

7. REGISTRATION PHASE
   ┌─────────────────────┐     REG_SIG        ┌─────────────────────┐
   │ Sign REG message    │                    │                     │
   │ (EIP-712)           │                    │                     │
   │ ↓                   │                    │                     │
   │ Send signature      │──────────────────→│ Receive signature   │
   └─────────────────────┘                    │ Store in storage    │
                                              │ ↓                   │
   ┌─────────────────────┐     REG_REC        │ Send confirmation   │
   │ Receive confirmation│←──────────────────│                     │
   └─────────────────────┘                    │                     │
                                              │ Submit REG tx       │
                                              │ ↓                   │
   ┌─────────────────────┐     REG_PAY        │ Wait for confirm    │
   │ Receive tx hash     │←──────────────────│ ↓                   │
   │ Store in store      │                    │ Send tx hash        │
   │ ↓                   │                    │                     │
   │ SUCCESS!            │                    │ SUCCESS!            │
   └─────────────────────┘                    └─────────────────────┘
```

### Message Sequence

| #   | Direction | Protocol  | Payload                                         |
| --- | --------- | --------- | ----------------------------------------------- |
| 1   | R→U       | `CONNECT` | `{ form: { relayer }, p2p: { partnerPeerId } }` |
| 2   | U→R       | `CONNECT` | `{ form: { registeree }, success: true }`       |
| 3   | U→R       | `ACK_SIG` | `{ signature: SignatureOverTheWire }`           |
| 4   | R→U       | `ACK_REC` | `{ success: true, message: 'Received' }`        |
| 5   | R→U       | `ACK_PAY` | `{ hash: '0x...' }`                             |
|     |           |           | _— Grace Period —_                              |
| 6   | U→R       | `REG_SIG` | `{ signature: SignatureOverTheWire }`           |
| 7   | R→U       | `REG_REC` | `{ success: true, message: 'Received' }`        |
| 8   | R→U       | `REG_PAY` | `{ hash: '0x...' }`                             |

Legend: U = User (registeree), R = Relayer

---

## Role-Based Protocol Handlers

### Registeree Handlers

Receives confirmations and transaction hashes:

```typescript
// File: apps/web/src/hooks/useP2PSignatureRelay.ts

if (role === 'registeree') {
  // Handle ACK receipt confirmation
  handlers.push({
    protocol: PROTOCOLS.ACK_REC,
    streamHandler: {
      handler: async (stream) => {
        const data = await readStreamData(stream);
        logger.p2p.info('ACK signature confirmed received');
        onStepAdvance?.();
      },
      options: { runOnLimitedConnection: true },
    },
  });

  // Handle ACK payment notification
  handlers.push({
    protocol: PROTOCOLS.ACK_PAY,
    streamHandler: {
      handler: async (stream) => {
        const data = await readStreamData(stream);
        if (isValidTxHash(data.hash)) {
          setAcknowledgementHash(data.hash);
          onTxHashReceived?.(data.hash, PROTOCOLS.ACK_PAY);
        }
        onStepAdvance?.();
      },
      options: { runOnLimitedConnection: true },
    },
  });

  // Similar handlers for REG_REC and REG_PAY...
}
```

### Relayer Handlers

Receives signatures and validates them:

```typescript
if (role === 'relayer') {
  handlers.push({
    protocol: PROTOCOLS.ACK_SIG,
    streamHandler: {
      handler: async (stream, connection) => {
        const data = await readStreamData(stream);

        // Validate signature data
        if (!isValidSignature(data.signature)) {
          logger.p2p.error('Invalid ACK signature data');
          return;
        }

        // Store for later submission
        const stored: StoredSignature = {
          signature: data.signature.value as `0x${string}`,
          deadline: BigInt(data.signature.deadline),
          nonce: BigInt(data.signature.nonce),
          address: data.signature.address,
          chainId: data.signature.chainId,
          step: SIGNATURE_STEP.ACKNOWLEDGEMENT,
          storedAt: Date.now(),
        };
        storeSignature(stored);

        // Confirm receipt
        await passStreamData({
          connection,
          protocols: [PROTOCOLS.ACK_REC],
          streamData: { success: true },
        });

        onSignatureReceived?.(data.signature, PROTOCOLS.ACK_SIG);
        onStepAdvance?.();
      },
      options: { runOnLimitedConnection: true },
    },
  });

  // Similar handler for REG_SIG...
}
```

---

## Relay Server Configuration

```typescript
// File: apps/web/src/lib/p2p/types.ts

export const RELAY_SERVERS: Record<string, RelayConfig[]> = {
  development: [
    {
      multiaddr:
        '/ip4/127.0.0.1/tcp/12312/ws/p2p/12D3KooWKiDztC8EkavAWNratG2nRPmv4DGa2tEr3p9xrLVgvTG5',
      isDev: true,
    },
  ],
  production: [
    // Configure via VITE_RELAY_MULTIADDR or add here
  ],
};

export function getRelayServers(): RelayConfig[] {
  const env = import.meta.env.MODE || 'development';

  // Environment variable override
  const envRelay = import.meta.env.VITE_RELAY_MULTIADDR;
  if (envRelay) {
    return [{ multiaddr: envRelay, isDev: false }];
  }

  const servers = RELAY_SERVERS[env];

  // Fail fast in production if unconfigured
  if (env === 'production' && (!servers || servers.length === 0)) {
    throw new RelayConfigurationError('Production relay servers not configured.');
  }

  return servers || RELAY_SERVERS.development;
}
```

---

## Error Handling

### Custom Error Types

```typescript
// File: apps/web/src/lib/p2p/libp2p.ts

export class StreamDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamDataValidationError';
  }
}

// File: apps/web/src/lib/p2p/types.ts

export class RelayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelayConfigurationError';
  }
}
```

### Validation Functions

```typescript
// File: apps/web/src/hooks/useP2PSignatureRelay.ts

function isValidSignature(sig: unknown): sig is SignatureOverTheWire {
  if (!sig || typeof sig !== 'object') return false;

  const s = sig as Record<string, unknown>;

  // Validate all required fields
  if (typeof s.value !== 'string' || !s.value) return false;
  if (!/^0x[0-9a-fA-F]{40}$/.test(s.address as string)) return false;
  if (!Number.isInteger(s.chainId)) return false;
  if (!/^\d+$/.test(s.deadline as string)) return false;
  if (!/^\d+$/.test(s.nonce as string)) return false;

  return true;
}

function isValidTxHash(hash: unknown): hash is `0x${string}` {
  return typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash);
}
```

---

## File Structure

```
apps/web/src/
├── lib/
│   └── p2p/
│       ├── index.ts           # Barrel export
│       ├── libp2p.ts          # Node setup, connections, streams
│       ├── protocols.ts       # Protocol constants
│       └── types.ts           # Zod schemas, interfaces, config
│
├── hooks/
│   ├── useP2PConnection.ts    # Base connection hook
│   ├── useP2PSignatureRelay.ts # Signature relay hook
│   └── useP2PKeepAlive.ts     # Connection health
│
└── stores/
    └── p2pStore.ts            # P2P state management
```

---

## Logging Integration

P2P operations use the `p2p` category logger:

```typescript
// Connection events
logger.p2p.info('P2P node initialized', { peerId });
logger.p2p.info('Connected to peer', { remotePeerId });

// Protocol messages
logger.p2p.info('Sent ACK signature');
logger.p2p.info('Received ACK payment hash', { hash });

// Errors
logger.p2p.error('Connection failed', { remotePeerId }, error);
logger.p2p.warn('Invalid signature data received');
```

---

## Future Architecture (Target)

The current architecture uses a self-hosted relay server. The target architecture eliminates hosting costs:

```
Current:
  Browser A ──→ Self-hosted Relay ──→ Browser B
                (Digital Ocean)

Target:
  Browser A ──→ Public IPFS Relays ──→ Browser B
                (Free infrastructure)
              ↓
         Direct WebRTC (~85% of connections)
              ↓
        Browser A ←───────────→ Browser B
```

**Changes Required:**

1. Replace self-hosted relay with public IPFS bootstrap nodes
2. Implement WebRTC signaling via public relays
3. Add fallback chain for connection establishment
4. Safari fallback remains WebSocket through relay

---

## Summary

The libp2p P2P relay system provides:

1. **NAT traversal** via Circuit Relay V2
2. **Direct connections** via WebRTC (DCUtR upgrade)
3. **8 custom protocols** for registration relay
4. **Strict validation** (Zod schemas, size limits)
5. **Security hardening** (safe JSON, connection gating)
6. **Role-based handlers** (registeree vs relayer)
7. **State management** via Zustand store
8. **Comprehensive logging** for debugging

The architecture enables users with no funds to register stolen wallets by relaying signatures to a helper who pays the gas fees, all without requiring a centralized server.
