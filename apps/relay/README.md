# @swr/relay

libp2p circuit relay server for helper-assisted registration in the Stolen Wallet Registry.

## Purpose

Enables P2P relay registration where:

1. A victim signs with their compromised wallet
2. The signature is relayed to a trusted helper via libp2p
3. The helper pays gas on the victim's behalf

## Setup

From monorepo root:

```bash
pnpm install
pnpm relay:setup
```

`pnpm relay:setup` generates `apps/relay/keys.json` with a persistent peer ID.

## Configuration

### keys.json (local/dev)

```json
{
  "id": "12D3KooW...",
  "privKey": "<base64>"
}
```

Do not commit `keys.json`.

### RELAY_PRIVATE_KEY (prod)

Set `RELAY_PRIVATE_KEY` to a base64-encoded Ed25519 private key to avoid local files.

### Reservation limits

Circuit relay slots are the scarce resource here. P2P relay is the only registration method
available to a victim whose wallet has been drained, so exhausting these slots does not degrade
the product — it removes those users' only option. Defaults live in `src/relay-limits.mjs` and
are printed at startup.

| Variable                      | Default   | Purpose                                              |
| ----------------------------- | --------- | ---------------------------------------------------- |
| `RELAY_MAX_RESERVATIONS`      | `512`     | Global reservation ceiling (libp2p default is 15).   |
| `RELAY_RESERVATIONS_PER_HOST` | `8`       | Reservations one source host may hold.               |
| `RELAY_MAX_CONNECTIONS`       | `600`     | Connection ceiling; must exceed the reservation cap. |
| `RELAY_RESERVATION_TTL_MS`    | `1200000` | Reservation lifetime (20 minutes).                   |

A registration flow needs two reservations (registeree + relayer) for roughly 15 minutes worst
case — a 1-4 minute randomized grace period plus the registration window. The per-host cap of 8
leaves room for shared NAT and reconnect churn while making it take at least 64 distinct source
addresses to fill the global ceiling, rather than the single host that could fill the old 15.

`@libp2p/circuit-relay-v2` has no per-peer or per-IP reservation option; the cap is enforced via
the `connectionGater.denyInboundRelayReservation` hook, which the relay server consults
immediately before granting a reservation. Reservation _renewals_ are never denied, and a
request whose source host cannot be determined is allowed (falling back to the global ceiling)
so that an unrecognised transport can never take the relay offline for everyone.

## Running

```bash
pnpm relay
pnpm relay:debug
```

## Ports

- **12312**: WebSocket relay

## Data Storage

- `.data/relay-datastore/`: LevelDB datastore for peer identity persistence

## Production Deployment

### Digital Ocean Droplet

1. Clone the monorepo
2. Install dependencies: `pnpm install`
3. Configure `RELAY_PRIVATE_KEY` or copy `keys.json` to `apps/relay/`
4. Run with PM2:

```bash
pm2 start "pnpm --filter @swr/relay start:debug" --name "relay"
```

### Docker

```bash
docker build -t swr-relay -f apps/relay/Dockerfile .
docker run -p 12312:12312 swr-relay
```
