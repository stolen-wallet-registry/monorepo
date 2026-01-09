# Contract Address Deployment Checklist

This document tracks zero-address placeholders that need to be filled in after deploying contracts to each network.

## Why Zero Address Placeholders?

Several contract address mappings use `0x0000000000000000000000000000000000000000` as a placeholder. These will cause runtime errors if the frontend attempts to interact with these chains before contracts are deployed.

The `getSpokeAddress()` function in `crosschain-addresses.ts` validates against zero addresses and throws a helpful error. However, hub addresses in `addresses.ts` and `crosschain-addresses.ts` do not have equivalent validation.

## Testnet Deployment (Base Sepolia + Optimism Sepolia)

After running `forge script script/DeployTestnet.s.sol`, update these files:

### `apps/web/src/lib/contracts/addresses.ts`

```typescript
// Lines 27-38: Update Base Sepolia hub addresses
[baseSepolia.id]: '<DEPLOYED_ADDRESS>', // registryHub
[baseSepolia.id]: '<DEPLOYED_ADDRESS>', // feeManager
[baseSepolia.id]: '<DEPLOYED_ADDRESS>', // stolenWalletRegistry
```

### `apps/web/src/lib/contracts/crosschain-addresses.ts`

```typescript
// Line 74: Update Base Sepolia CrossChainInbox
[baseSepolia.id]: '<DEPLOYED_ADDRESS>', // crossChainInbox

// Lines 100-111: Update Optimism Sepolia spoke addresses
[optimismSepolia.id]: '<DEPLOYED_ADDRESS>', // hyperlaneAdapter
[optimismSepolia.id]: '<DEPLOYED_ADDRESS>', // feeManager (spoke)
[optimismSepolia.id]: '<DEPLOYED_ADDRESS>', // spokeRegistry
```

## Mainnet Deployment (Base + Optimism)

After mainnet deployment, add entries to:

- `addresses.ts` - Hub chain contracts (Base mainnet, chain ID 8453)
- `crosschain-addresses.ts` - CrossChainInbox on hub, spoke contracts on Optimism (chain ID 10)

## Validation

After updating addresses, verify with:

```bash
# Run the web app
pnpm dev

# Try connecting to the testnet/mainnet chain
# The app should NOT throw "No address configured" errors
```

## Files to Update

| Network                     | File                      | Contracts                                     |
| --------------------------- | ------------------------- | --------------------------------------------- |
| Base Sepolia (84532)        | `addresses.ts`            | registryHub, feeManager, stolenWalletRegistry |
| Base Sepolia (84532)        | `crosschain-addresses.ts` | crossChainInbox                               |
| Optimism Sepolia (11155420) | `crosschain-addresses.ts` | hyperlaneAdapter, feeManager, spokeRegistry   |
| Base (8453)                 | `addresses.ts`            | registryHub, feeManager, stolenWalletRegistry |
| Base (8453)                 | `crosschain-addresses.ts` | crossChainInbox                               |
| Optimism (10)               | `crosschain-addresses.ts` | hyperlaneAdapter, feeManager, spokeRegistry   |

## Hyperlane Addresses

Hyperlane Mailbox and IGP addresses for testnets are already configured with official addresses from the Hyperlane registry. These do NOT need updating:

- Base Sepolia Mailbox: `0x6966b0E55883d49BFB24539356a2f8A673E02039`
- Optimism Sepolia Mailbox: `0x6966b0E55883d49BFB24539356a2f8A673E02039`
- IGP: `0x28B02B97a850872C4D33C3E024fab6499ad96564`
