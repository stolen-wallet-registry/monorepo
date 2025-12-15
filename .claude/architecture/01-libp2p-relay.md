# libp2p P2P Relay

P2P signature relay for helper-assisted wallet registration using libp2p 3.x.

---

## Why P2P?

- **NAT Traversal** - Browser clients communicate via relay
- **No Trust Required** - Signatures cryptographically verified on-chain
- **Cost Efficiency** - Public relay infrastructure, no hosting costs

---

## Transport Stack

```typescript
// apps/web/src/lib/p2p/libp2p.ts

transports: [
  circuitRelayTransport(),  // NAT traversal via relay
  webRTC(),                 // Direct browser-to-browser (primary)
  webSockets(),             // Safari fallback
],

connectionEncrypters: [noise()],
streamMuxers: [yamux()],

services: {
  identify: identify(),
  dcutr: dcutr(),   // Direct Connection Upgrade through Relay
  ping: ping(),
},
```

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
