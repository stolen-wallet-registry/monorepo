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
