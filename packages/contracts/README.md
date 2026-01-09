# Stolen Wallet Registry - Smart Contracts

Solidity smart contracts for the Stolen Wallet Registry, a cross-chain fraud detection and transparency system.

## Quick Start

```bash
# Install dependencies
forge install

# Build contracts
forge build

# Run tests
forge test

# Deploy locally
anvil &
forge script script/Deploy.s.sol --rpc-url localhost --broadcast
```

## Contract Architecture

```
src/
├── RegistryHub.sol                 # Main entry point on hub chain
├── FeeManager.sol                  # Dynamic USD-based fee calculation
├── registries/
│   └── StolenWalletRegistry.sol    # Hub chain wallet registration
├── spoke/
│   └── SpokeRegistry.sol           # Spoke chain registration
├── crosschain/
│   ├── CrossChainInbox.sol         # Receives cross-chain messages on hub
│   └── adapters/
│       └── HyperlaneAdapter.sol    # Hyperlane bridge adapter
├── interfaces/                     # Contract interfaces
└── libraries/
    ├── TimingConfig.sol            # Block timing calculations
    └── CrossChainMessage.sol       # Cross-chain message encoding
```

## Block Timing Configuration

### Why This Matters

EVM chains have vastly different block times:

- **Ethereum L1**: ~12 seconds per block
- **Base/Optimism**: ~2 seconds per block
- **Arbitrum**: ~0.25 seconds per block

The registration flow uses block-based timing for:

1. **Grace Period**: Time after acknowledgement before registration is allowed
2. **Deadline Window**: Time within which registration must complete

Without chain-specific configuration, a flow designed for Ethereum (12s blocks) would be unusable on Arbitrum (0.25s blocks) - a 50-block deadline would be ~12 seconds instead of ~10 minutes.

### Target User Experience

All chains should provide consistent UX:

- **Grace Period**: ~2 minutes (prevents single-transaction phishing)
- **Deadline Window**: ~10 minutes (reasonable time to complete registration)

### Per-Chain Block Values

| Chain         | Block Time | Grace Blocks | Grace Time | Deadline Blocks | Deadline Time |
| ------------- | ---------- | ------------ | ---------- | --------------- | ------------- |
| Anvil (local) | 13s        | 10           | ~130s      | 50              | ~650s         |
| Ethereum L1   | 12s        | 10           | ~120s      | 50              | ~600s         |
| Base          | 2s         | 60           | ~120s      | 300             | ~600s         |
| Optimism      | 2s         | 60           | ~120s      | 300             | ~600s         |
| Arbitrum      | 0.25s      | 480          | ~120s      | 2400            | ~600s         |
| Polygon       | 2s         | 60           | ~120s      | 300             | ~600s         |

_Note: Actual times include randomization via `block.prevrandao` adding 0 to `base_blocks` additional blocks._

### Implementation

Timing is configured at deployment via constructor parameters stored as immutables:

```solidity
// StolenWalletRegistry.sol
uint256 public immutable graceBlocks;
uint256 public immutable deadlineBlocks;

constructor(
    address _feeManager,
    address _registryHub,
    uint256 _graceBlocks,    // Chain-specific
    uint256 _deadlineBlocks  // Chain-specific
) { ... }
```

Deployment scripts auto-select appropriate values and **revert on unsupported chains**:

```solidity
// DeployBase.s.sol
function getTimingConfig(uint256 chainId)
    internal pure
    returns (uint256 graceBlocks, uint256 deadlineBlocks)
{
    // Anvil/Local (13s blocks)
    if (chainId == 31337 || chainId == 31338) return (10, 50);

    // Base/Optimism (2s blocks)
    if (chainId == 8453 || chainId == 84532 ||
        chainId == 10 || chainId == 11155420) return (60, 300);

    // Arbitrum (0.25s blocks)
    if (chainId == 42161 || chainId == 421614) return (480, 2400);

    // Polygon (2s blocks)
    if (chainId == 137 || chainId == 80002) return (60, 300);

    // Ethereum L1 (12s blocks)
    if (chainId == 1) return (10, 50);

    // Unknown chain - MUST add config before deploying
    revert("DeployBase: unsupported chain ID - add timing config");
}
```

### Randomization

The `TimingConfig` library adds randomization to prevent timing attacks:

```solidity
function getGracePeriodEndBlock(uint256 graceBlocks) internal view returns (uint256) {
    return block.number + getRandomBlockOffset(graceBlocks) + graceBlocks;
}

function getRandomBlockOffset(uint256 maxOffset) internal view returns (uint256) {
    return uint256(keccak256(abi.encode(block.prevrandao, msg.sender))) % maxOffset;
}
```

This means:

- **Grace period**: `graceBlocks` to `2 * graceBlocks` actual blocks
- **Deadline**: `deadlineBlocks` to `2 * deadlineBlocks` actual blocks

The randomization makes it harder for attackers to predict exact timing windows.

## Deployment

### Local (Anvil)

```bash
anvil &
forge script script/Deploy.s.sol --rpc-url localhost --broadcast
```

### Base Sepolia (Testnet)

```bash
forge script script/DeployTestnet.s.sol --rpc-url base-sepolia --broadcast --verify
```

### Cross-Chain Deployment

For hub + spoke deployment across chains:

```bash
# Deploy hub on Base Sepolia
forge script script/DeployCrossChain.s.sol:DeployHub --rpc-url base-sepolia --broadcast

# Deploy spoke on Optimism Sepolia
forge script script/DeployCrossChain.s.sol:DeploySpoke --rpc-url optimism-sepolia --broadcast
```

## Testing

```bash
# Run all tests
forge test

# Run with verbosity
forge test -vvv

# Run specific test file
forge test --match-path test/StolenWalletRegistry.t.sol

# Run with gas report
forge test --gas-report

# Run coverage
forge coverage
```

## Security Considerations

### Two-Phase Registration

The EIP-712 two-phase registration prevents phishing attacks:

1. **Acknowledgement**: User signs intent, establishing a trusted forwarder
2. **Grace Period**: Randomized delay (chain-configured)
3. **Registration**: User signs registration within deadline window

This ensures:

- Attackers cannot complete registration in a single transaction
- Users have time to recognize and cancel suspicious acknowledgements
- Timing is unpredictable due to randomization

### Nonce Protection

All signatures include a nonce to prevent replay attacks. Nonces increment after each successful operation.

### Deadline Validation

Signatures include deadlines to prevent indefinite validity. Expired signatures are rejected.

## License

MIT
