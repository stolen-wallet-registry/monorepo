# Contract Address Deployment Checklist

This document tracks zero-address placeholders that need to be filled in after deploying contracts to each network.

## Why Zero Address Placeholders?

Several contract address mappings use `0x0000000000000000000000000000000000000000` as a placeholder. These will cause runtime errors if the frontend attempts to interact with these chains before contracts are deployed.

The `getSpokeAddress()` function in `crosschain-addresses.ts` validates against zero addresses and throws a helpful error. However, hub addresses in `addresses.ts` and `crosschain-addresses.ts` do not have equivalent validation.

**Future improvement:** Add similar validation to hub address getters in `addresses.ts` to match the robustness of `getSpokeAddress()`, ensuring early detection of misconfigured hub contracts.

## Testnet Deployment (Base Sepolia + Optimism Sepolia)

After running the deploy scripts, extract addresses from the output:

```bash
# Deploy Hub contracts to Base Sepolia
forge script script/DeployTestnet.s.sol:DeployTestnetHub \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY

# Deploy Spoke contracts to Optimism Sepolia
forge script script/DeployTestnet.s.sol:DeployTestnetSpoke \
  --rpc-url optimism_sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key $OPTIMISM_ETHERSCAN_API_KEY

# Look for lines like:
#   == Logs ==
#     FeeManager deployed at: 0x1234...
#     RegistryHub deployed at: 0x5678...
#     StolenWalletRegistry deployed at: 0x9abc...
#
# Or check the broadcast file for each deployment:
#   broadcast/DeployTestnet.s.sol/84532/run-latest.json (Base Sepolia)
#   broadcast/DeployTestnet.s.sol/11155420/run-latest.json (Optimism Sepolia)
#
# Use jq to extract addresses:
cat broadcast/DeployTestnet.s.sol/84532/run-latest.json | jq '.transactions[] | {contractName, contractAddress}'
```

Update these files with the extracted addresses:

### `apps/web/src/lib/contracts/addresses.ts`

```typescript
// Update each contract's address mapping with Base Sepolia entry:
stolenWalletRegistry: {
  // ... existing entries
  [baseSepolia.id]: '<STOLEN_WALLET_REGISTRY_ADDRESS>' as Address,
},
feeManager: {
  // ... existing entries
  [baseSepolia.id]: '<FEE_MANAGER_ADDRESS>' as Address,
},
registryHub: {
  // ... existing entries
  [baseSepolia.id]: '<REGISTRY_HUB_ADDRESS>' as Address,
},
```

### `apps/web/src/lib/contracts/crosschain-addresses.ts`

```typescript
// HUB_CROSSCHAIN_ADDRESSES - Update Base Sepolia CrossChainInbox:
crossChainInbox: {
  // ... existing entries
  [baseSepolia.id]: '<CROSS_CHAIN_INBOX_ADDRESS>' as Address,
},

// SPOKE_ADDRESSES - Update Optimism Sepolia spoke contracts:
hyperlaneAdapter: {
  // ... existing entries
  [optimismSepolia.id]: '<HYPERLANE_ADAPTER_ADDRESS>' as Address,
},
feeManager: {
  // ... existing entries
  [optimismSepolia.id]: '<SPOKE_FEE_MANAGER_ADDRESS>' as Address,
},
spokeRegistry: {
  // ... existing entries
  [optimismSepolia.id]: '<SPOKE_REGISTRY_ADDRESS>' as Address,
},
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
