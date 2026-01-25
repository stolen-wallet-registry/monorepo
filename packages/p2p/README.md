# @swr/p2p

P2P protocol definitions and relay configuration helpers for the SWR registration flows.

## Protocols

```ts
import { PROTOCOLS } from '@swr/p2p';
```

| Key     | Protocol ID                                     |
| ------- | ----------------------------------------------- |
| CONNECT | `/swr/connected/1.0.0`                          |
| ACK_SIG | `/swr/acknowledgement/signature/1.0.0`          |
| ACK_REC | `/swr/acknowledgement/signature/1.0.0/received` |
| ACK_PAY | `/swr/acknowledgement/payment/1.0.0`            |
| REG_SIG | `/swr/register/signature/1.0.0`                 |
| REG_REC | `/swr/register/signature/1.0.0/received`        |
| REG_PAY | `/swr/register/payment/1.0.0`                   |

## Relay Configuration

Relay servers are environment-aware and can be overridden via `VITE_RELAY_MULTIADDR`.

```ts
import { getRelayServers } from '@swr/p2p';

const servers = getRelayServers({
  mode: 'development',
  relayMultiaddr: import.meta.env.VITE_RELAY_MULTIADDR,
});
```

## Exports

- `PROTOCOLS`, `getAllProtocols`, `isValidProtocol`
- `getRelayServers`, `getRelayPeerIds`
- `RelayConfigurationError`
