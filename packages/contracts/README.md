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
├── FraudRegistryHub.sol            # Fee routing + shared registry config
├── FeeManager.sol                  # Fee quotes per registry (Chainlink price feeds)
├── OperatorRegistry.sol            # DAO-approved operators + capabilities
├── OperatorSubmitter.sol           # Operator batch submission entry point
├── CrossChainInbox.sol             # Inbound cross-chain message handling (Hyperlane)
├── registries/
│   ├── WalletRegistry.sol          # Two-phase wallet registration
│   ├── TransactionRegistry.sol     # Two-phase transaction batch registration
│   └── ContractRegistry.sol        # Operator-only contract batches
├── crosschain/
│   └── adapters/
│       └── HyperlaneAdapter.sol    # Hyperlane bridge adapter
├── spoke/
│   ├── SpokeRegistry.sol           # Wallet + transaction registration on spoke chains
│   └── SpokeSoulboundForwarder.sol # Spoke → hub forwarding for soulbound mints
├── soulbound/
│   ├── BaseSoulbound.sol           # Shared soulbound token base (ERC-5192)
│   ├── WalletSoulbound.sol         # Wallet attestation NFT
│   ├── SupportSoulbound.sol        # Supporter attestation NFT
│   ├── SoulboundReceiver.sol       # Safe minting receiver
│   ├── TranslationRegistry.sol     # Language metadata for token URIs
│   ├── interfaces/
│   │   ├── IERC5192.sol            # Soulbound token interface
│   │   └── ITranslationRegistry.sol
│   └── libraries/
│       └── SVGRenderer.sol         # On-chain SVG generation for token URIs
├── interfaces/
│   ├── IWalletRegistry.sol
│   ├── ITransactionRegistry.sol
│   ├── IContractRegistry.sol
│   ├── IFraudRegistryHub.sol
│   ├── IFeeManager.sol
│   ├── IOperatorRegistry.sol
│   ├── ISpokeRegistry.sol
│   ├── ISpokeSoulboundForwarder.sol
│   ├── ISoulboundReceiver.sol
│   ├── IBridgeAdapter.sol
│   └── chainlink/
│       └── AggregatorV3Interface.sol
└── libraries/
    ├── TimingConfig.sol            # Grace period + deadline randomization
    ├── EIP712Constants.sol         # Shared EIP-712 domain + typehash constants
    ├── CAIP10.sol                  # CAIP-10 multi-chain address encoding
    ├── CAIP10Evm.sol               # EVM-specific CAIP-10 helpers
    ├── CrossChainMessage.sol       # Cross-chain message encoding/decoding
    └── RegistryCapabilities.sol    # Operator capability flags
```

## Registry Behavior

| Registry                     | Submission              | Flow                                  | Notes                                                |
| ---------------------------- | ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| Stolen Wallet Registry       | Individuals + operators | Two-phase EIP-712 (ACK → grace → REG) | Individuals self-attest; operators can batch-submit. |
| Stolen Transaction Registry  | Individuals + operators | Two-phase EIP-712 (ACK → grace → REG) | Registration is for batches of tx hashes.            |
| Fraudulent Contract Registry | Operators only          | Single-phase                          | Batch submission via operator arrays.                |

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
├── Deploy.s.sol              # All deployment functions (local, testnet, mainnet)
├── DeployCrossChain.s.sol    # Hub + spoke local deploy (legacy)
├── SeedLanguages.s.sol       # Seed language metadata
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

### Testnet (Base Sepolia + Optimism Sepolia)

Requires a `.env.testnet` file with deployer key, RPC URLs, and Etherscan API keys. See the [Testnet Deployment guide](/dev/testnet-deployment) in the docs for full setup instructions.

```bash
# 1. Deploy all hub contracts to Base Sepolia (core + FeeManager + soulbound)
pnpm deploy:testnet:hub

# 2. Deploy spoke contracts to Optimism Sepolia
#    (set HUB_INBOX_ADDRESS and SOULBOUND_RECEIVER in .env.testnet from step 1 output)
pnpm deploy:testnet:spoke

# 3. Configure trust relationships (see the guide), THEN lock the timelock:
pnpm finalize:testnet:hub

# 4. Gate: reverts if anything still has setupComplete == false
pnpm verify:setup:testnet:hub
```

After deployment, configure trust relationships via `cast send` and update `@swr/chains` with deployed addresses. See the [Testnet Deployment guide](/dev/testnet-deployment) in the docs for the full walkthrough.

### Finalizing setup (required)

Every `TimelockOwnable` contract starts with `setupComplete == false`, which leaves its
`onlyDuringSetup` setters — `setWalletRegistry`, `setInbox`, `setTrustedSource`,
`setHub`, `setOperatorSubmitter`, `setOperatorRegistry`, `setAuthorizedMinter` — callable
by the owner in a single transaction. **Until `finalizeSetup()` runs, the 2-day timelock
provides no protection at all**: the propose/activate path exists but is optional.

`finalizeSetup()` is a separate step rather than a tail call inside the deploy functions
because the inbox's trusted sources can only be wired after the spoke exists. Completing
setup inside `deployHub()` would permanently lock out `setTrustedSource` before it was
ever called.

Run it **last**, after all cross-chain trust wiring, then run `verifySetup()` as a gate so
a forgotten finalize fails loudly instead of shipping an open deployment. Both read the
deployed addresses from `.env.testnet` (`FRAUD_REGISTRY_HUB`, `CROSS_CHAIN_INBOX`,
`OPERATOR_REGISTRY`, `SOULBOUND_RECEIVER`, `WALLET_SOULBOUND`, `SUPPORT_SOULBOUND`,
`WALLET_REGISTRY`, `TRANSACTION_REGISTRY`, `CONTRACT_REGISTRY`, `OPERATOR_SUBMITTER`);
unset addresses are skipped.

`completeSetup()` is irreversible. Afterwards, trust-boundary changes require
`propose*` → wait 2 days → `activate*`.

Local deploy scripts deliberately do **not** call it — the dashboard's operator-approval
flow uses the immediate `approveOperator` path, which locks after setup.

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

## Future Work

Features not yet implemented but structurally supported:

- **Entry Invalidation/Reinstatement** - DAO governance to invalidate false positives and reinstate wrongly invalidated entries. Storage structs include `invalidated` boolean field; functions removed until app integration.
- **Operator Contract Separation** - Potential extraction of operator batch functions into separate contract sharing storage (Diamond pattern or inheritance).
- **Event Optimization** - Consider emitting bytes32 storage keys in events and parsing CAIP-10 format off-chain to reduce conditional logic.
