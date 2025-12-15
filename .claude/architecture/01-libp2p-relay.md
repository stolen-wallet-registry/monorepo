# libp2p P2P Relay

P2P signature relay for helper-assisted wallet registration using libp2p 3.x.

---

## Why P2P?

- **NAT Traversal** - Browser clients communicate via relay
- **No Trust Required** - Signatures cryptographically verified on-chain
- **Cost Efficiency** - Public relay infrastructure, no hosting costs

---

## Component Reference

### Transports

| Transport               | Purpose                         | When Used                                 |
| ----------------------- | ------------------------------- | ----------------------------------------- |
| `circuitRelayTransport` | NAT traversal via relay server  | Always (initial connection)               |
| `webRTC`                | Direct browser-to-browser       | After dcutr upgrade (~85% of connections) |
| `webRTCDirect`          | WebRTC without signaling server | When peer addresses known                 |
| `webTransport`          | HTTP/3-based transport          | Modern browsers with QUIC support         |
| `webSockets`            | Fallback transport              | Safari, older browsers                    |

### Services

| Service    | Purpose                                       | Configuration                         |
| ---------- | --------------------------------------------- | ------------------------------------- |
| `identify` | Exchange peer metadata (protocols, addresses) | Required for all libp2p nodes         |
| `ping`     | Keep-alive heartbeats, latency measurement    | Used by `useP2PKeepAlive` hook        |
| `dcutr`    | Direct Connection Upgrade through Relay       | Upgrades relayed → direct connections |

### Connection Encryption & Multiplexing

| Component | Purpose                                                   |
| --------- | --------------------------------------------------------- |
| `noise`   | Noise Protocol encryption (libp2p standard)               |
| `yamux`   | Stream multiplexer (multiple streams over one connection) |

---

## Configuration Details

### Web Client (`apps/web/src/lib/p2p/libp2p.ts`)

```typescript
transports: [
  circuitRelayTransport({
    // Give slow connections more time during relay reservation
    // Default: 10s, we use 15s for unreliable networks
    reservationCompletionTimeout: 15_000,
  }),
  webRTC(),
  webRTCDirect(),
  webTransport(),
  webSockets(),
],

connectionEncrypters: [noise()],
streamMuxers: [yamux()],

services: {
  identify: identify(),
  dcutr: dcutr(),
  ping: ping(),
},

connectionGater: {
  // Block localhost/private networks in production
  denyDialMultiaddr: (ma) => { ... },
},
```

### Relay Server (`apps/relay/src/index.mjs`)

```javascript
transports: [webSockets()],
connectionEncrypters: [noise()],
streamMuxers: [yamux()],

connectionManager: {
  maxConnections: 100,
},

services: {
  identify: identify(),
  ping: ping(),     // Enables keep-alive pings from clients
  dcutr: dcutr(),   // Enables direct connection upgrade through relay
  relay: circuitRelayServer({
    // Grace period takes 1-4 min; longer timeout prevents premature resets
    hopTimeout: 60_000,  // Default: 30s
    reservations: {
      maxReservations: 15,
      reservationTtl: 30 * 60 * 1000, // 30 minutes
    },
  }),
},
```

---

## How dcutr Works

Direct Connection Upgrade through Relay (dcutr) enables peers to upgrade from a relayed connection to a direct one:

```text
1. INITIAL STATE
   Peer A ←──relay──→ Relay Server ←──relay──→ Peer B
   (All traffic flows through relay - higher latency)

2. DCUTR NEGOTIATION
   - Peer A sends its public addresses to Peer B via relay
   - Peer B sends its public addresses to Peer A via relay
   - Both peers attempt direct connections simultaneously
   - Simultaneous open helps punch through NAT

3. UPGRADED STATE
   Peer A ←─────────direct WebRTC─────────→ Peer B
   (Relay no longer in data path - lower latency)
```

**Benefits:**

- Reduces relay server load
- Lower latency for data transfer
- Works for ~85% of connections (depends on NAT types)

---

## How Keep-Alive Works

The `useP2PKeepAlive` hook uses the ping service to maintain circuit relay connections:

```text
Circuit relay reservations expire after ~2 minutes of inactivity.
Without keep-alive, connections drop during grace period (1-4 min).

┌─────────────┐     ping every 45s      ┌─────────────┐
│  Registeree │ ←───────────────────────→│   Relayer   │
└─────────────┘                          └─────────────┘
       │                                        │
       │  latency measured, failures tracked    │
       │  3 consecutive failures = unhealthy    │
       └────────────────────────────────────────┘
```

**Configuration:**

- Ping interval: 45 seconds (default)
- Max latency warning: 5 seconds
- Consecutive failures before unhealthy: 3

---

## Key Configuration Options

### `reservationCompletionTimeout` (Client)

Time allowed for relay reservation to complete. Increase for slow/unreliable networks.

- Default: 10,000ms (10s)
- Our setting: 15,000ms (15s)

### `hopTimeout` (Relay Server)

Maximum time a relay hop can remain open. Must be longer than your longest operation.

- Default: 30,000ms (30s)
- Our setting: 60,000ms (60s) - covers 1-4 minute grace period

### `maxReservations` (Relay Server)

Maximum concurrent relay reservations. Limits resource usage.

- Default: 15
- Development: Can set to `Infinity` for testing

### `reservationTtl` (Relay Server)

How long a reservation remains valid without activity.

- Our setting: 30 minutes

---

## Custom Protocols

```typescript
// apps/web/src/lib/p2p/protocols.ts

export const PROTOCOLS = {
  CONNECT: '/swr/connected/1.0.0',
  ACK_SIG: '/swr/acknowledgement/signature/1.0.0',
  ACK_REC: '/swr/acknowledgement/signature/1.0.0/received',
  ACK_PAY: '/swr/acknowledgement/payment/1.0.0',
  REG_SIG: '/swr/register/signature/1.0.0',
  REG_REC: '/swr/register/signature/1.0.0/received',
  REG_PAY: '/swr/register/payment/1.0.0',
} as const;
```

---

## Message Format

```typescript
// apps/web/src/lib/p2p/types.ts

export interface ParsedStreamData {
  success?: boolean;
  message?: string;
  p2p?: { peerId?: string; partnerPeerId?: string; connectedToPeer?: boolean };
  form?: { registeree?: `0x${string}`; relayer?: `0x${string}` };
  signature?: SignatureOverTheWire;
  hash?: `0x${string}`;
}

export interface SignatureOverTheWire {
  keyRef: string;
  chainId: number;
  address: `0x${string}`;
  value: string;
  deadline: string; // BigInt as string
  nonce: string; // BigInt as string
}
```

---

## Security Features

| Feature           | Implementation                                                   |
| ----------------- | ---------------------------------------------------------------- |
| Size limit        | `MAX_STREAM_SIZE_BYTES = 100KB`                                  |
| JSON safety       | `safeJsonParse()` strips `__proto__`, `constructor`, `prototype` |
| Schema validation | Zod `.strict()` rejects unknown keys                             |
| Connection gating | Block localhost/private in production                            |

---

## Complete Flow

```text
REGISTEREE                              RELAYER
(stolen wallet)                         (has funds)

1. Initialize libp2p nodes
2. Exchange peer IDs (out-of-band)
3. Relayer dials registeree via circuit relay

4. HANDSHAKE (CONNECT)
   Registeree ←→ Relayer exchange addresses

5. ACKNOWLEDGEMENT
   Registeree signs ACK ──ACK_SIG──→ Relayer stores
                        ←─ACK_REC── Relayer confirms
   Relayer submits tx   ←─ACK_PAY── Relayer sends hash

6. GRACE PERIOD (1-4 min)

7. REGISTRATION
   Registeree signs REG ──REG_SIG──→ Relayer stores
                        ←─REG_REC── Relayer confirms
   Relayer submits tx   ←─REG_PAY── Relayer sends hash
                                    SUCCESS!
```

---

## Hooks

**`useP2PConnection`** - Base connection hook:

- `initialize()`, `connect(remotePeerId)`, `disconnect()`, `send()`
- Manages libp2p node lifecycle

**`useP2PSignatureRelay`** - Higher-level relay hook:

- `sendAckSignature()`, `sendRegSignature()`
- `sendAckTxHash()`, `sendRegTxHash()`
- Role-based handlers (registeree vs relayer)

---

## Key Files

```text
apps/web/src/
├── lib/p2p/
│   ├── libp2p.ts       # Node setup, connections, streams
│   ├── protocols.ts    # Protocol constants
│   └── types.ts        # Zod schemas, interfaces
├── hooks/
│   ├── useP2PConnection.ts
│   └── useP2PSignatureRelay.ts
└── stores/
    └── p2pStore.ts     # Connection state
```
