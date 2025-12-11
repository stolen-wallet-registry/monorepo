# @swr/relay

libp2p circuit relay server for P2P wallet registration in the Stolen Wallet Registry.

## Purpose

Enables P2P relay registration where:

1. A victim signs with their compromised wallet
2. The signature is relayed to a trusted helper via libp2p
3. The helper pays gas on the victim's behalf

## Setup

From monorepo root:

```bash
pnpm install
```

## Configuration

The relay requires a `keys.json` file for persistent peer identity:

```json
{
  "id": "...",
  "privKey": "...",
  "pubKey": "...",
  "password": "your-keychain-password"
}
```

**Note:** The `privKey`/`pubKey` fields are legacy - only `password` is used now for the keychain. The private key is stored in the LevelDB datastore.

## Running

From monorepo root:

```bash
# Normal mode
pnpm --filter @swr/relay dev

# Debug mode (shows libp2p logs)
pnpm --filter @swr/relay dev:debug
```

Or use the root-level scripts:

```bash
pnpm relay
pnpm relay:debug
```

## Production Deployment

### Digital Ocean Droplet

1. Clone the monorepo
2. Install dependencies: `pnpm install`
3. Copy your `keys.json` to `apps/relay/`
4. Run with PM2:

```bash
pm2 start "pnpm --filter @swr/relay start:debug" --name "relay"
```

### Docker

```bash
docker build -t swr-relay -f apps/relay/Dockerfile .
docker run -p 12312:12312 swr-relay
```

## Ports

- **12312**: WebSocket relay (main port)

## Data Storage

- `.data/relay-datastore/`: LevelDB datastore for peer identity persistence
