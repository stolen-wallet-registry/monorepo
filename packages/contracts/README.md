# SWR Contracts

Solidity contracts for the Stolen Wallet Registry ecosystem (wallets, transactions, and fraudulent contracts), plus cross-chain and operator infrastructure.

## Requirements

- Foundry
- Solidity `0.8.24`

## Quick Start

```bash
# Install dependencies
forge install

# Build contracts
forge build

# Run tests
forge test

# Local deploy (Anvil)
anvil &
forge script script/Deploy.s.sol --rpc-url localhost --broadcast
```

## Contract Architecture

```text
src/
├── RegistryHub.sol                 # Fee routing + shared registry config
├── FeeManager.sol                  # Fee quotes per registry
├── OperatorRegistry.sol            # DAO-approved operators + capabilities
├── registries/
│   ├── StolenWalletRegistry.sol      # Two-phase wallet registration
│   ├── StolenTransactionRegistry.sol # Two-phase transaction batch registration
│   └── FraudulentContractRegistry.sol# Operator-only contract batches
├── crosschain/
│   ├── BridgeRouter.sol            # Outbound message routing
│   ├── CrossChainInbox.sol         # Inbound message handling
│   └── adapters/HyperlaneAdapter.sol
├── spoke/
│   ├── SpokeRegistry.sol           # Wallet registration on spoke chains
│   ├── SpokeTransactionRegistry.sol# Transaction registration on spoke chains
│   └── SpokeSoulboundForwarder.sol # Spoke → hub forwarding for soulbound mints
├── soulbound/
│   ├── TranslationRegistry.sol     # Language metadata
│   ├── WalletSoulbound.sol         # Wallet attestation NFT
│   ├── SupportSoulbound.sol        # Supporter attestation NFT
│   └── SoulboundReceiver.sol       # Safe minting receiver
├── interfaces/
└── libraries/
    ├── TimingConfig.sol            # Grace period + deadline randomization
    ├── MerkleRootComputation.sol   # OZ-compatible Merkle leaf hashing
    ├── CAIP2.sol                   # CAIP-2 conversion helpers
    ├── CrossChainMessage.sol       # Message encoding
    └── RegistryCapabilities.sol    # Operator capability flags
```

## Registry Behavior

| Registry                     | Submission              | Flow                                  | Notes                                                |
| ---------------------------- | ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| Stolen Wallet Registry       | Individuals + operators | Two-phase EIP-712 (ACK → grace → REG) | Individuals self-attest; operators can batch-submit. |
| Stolen Transaction Registry  | Individuals + operators | Two-phase EIP-712 (ACK → grace → REG) | Registration is for batches of tx hashes.            |
| Fraudulent Contract Registry | Operators only          | Single-phase                          | Batch submission via Merkle roots.                   |

## Block Timing Configuration

The registration flow uses block-based timing to provide consistent UX across chains.

### Target User Experience

- **Grace Period:** ~2 minutes (prevents single-transaction phishing)
- **Deadline Window:** ~10 minutes (reasonable time to complete registration)

### Chain-Specific Block Values

| Chain         | Block Time | Grace Blocks | Grace Time | Deadline Blocks | Deadline Time |
| ------------- | ---------- | ------------ | ---------- | --------------- | ------------- |
| Anvil (local) | 13s        | 10           | ~130s      | 50              | ~650s         |
| Ethereum L1   | 12s        | 10           | ~120s      | 50              | ~600s         |
| Base          | 2s         | 60           | ~120s      | 300             | ~600s         |
| Optimism      | 2s         | 60           | ~120s      | 300             | ~600s         |
| Arbitrum      | 0.25s      | 480          | ~120s      | 2400            | ~600s         |
| Polygon       | 2s         | 60           | ~120s      | 300             | ~600s         |

_Note: Actual times include randomization via `block.prevrandao` adding 0 to `base_blocks` additional blocks._

### Randomization

`TimingConfig.sol` adds randomization to prevent timing attacks:

```solidity
function getGracePeriodEndBlock(uint256 graceBlocks) internal view returns (uint256) {
    return block.number + getRandomBlockOffset(graceBlocks) + graceBlocks;
}
```

This produces a grace period between `graceBlocks` and `2 * graceBlocks`.

## Deployment Scripts

```text
script/
├── Deploy.s.sol              # Local hub deploy
├── DeployCrossChain.s.sol    # Hub + spoke deploy
├── DeployTestnet.s.sol       # Testnet deploy
├── DeploySoulbound.s.sol     # Soulbound contracts
├── SeedOperatorData.s.sol    # Seed operators for local/test
├── SeedTransactions.s.sol    # Seed sample txs for local/test
```

### Local (Anvil)

```bash
anvil &
forge script script/Deploy.s.sol --rpc-url localhost --broadcast
```

### Cross-Chain (Local)

```bash
forge script script/DeployCrossChain.s.sol --tc DeployCrossChain --broadcast
forge script script/SeedLanguages.s.sol --rpc-url localhost --broadcast
forge script script/SeedOperatorData.s.sol --rpc-url localhost --broadcast --slow
forge script script/SeedTransactions.s.sol --multi --broadcast --slow
```

### Testnet

```bash
# Base Sepolia hub
pnpm --filter @swr/contracts deploy:testnet:hub

# Optimism Sepolia spoke
pnpm --filter @swr/contracts deploy:testnet:spoke
```

## Testing

```bash
forge test
forge test -vvv
forge coverage
forge test --gas-report
```

## Security Considerations

- Two-phase EIP-712 registration prevents single-transaction phishing.
- Nonces and deadlines prevent replay attacks.
- Operator permissions enforced via `OperatorRegistry` and capability flags.
