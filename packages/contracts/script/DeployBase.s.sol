// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";

/// @title DeployBase
/// @notice Shared deployment logic for core SWR contracts
/// @dev Inherit from this to ensure consistent addresses across deploy scripts
///
/// Nonce order (Account 0):
///   0: MockAggregator       → 0x5FbDB2315678afecb367f032d93F642f64180aa3
///   1: FeeManager           → 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
///   2: RegistryHub          → 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
///   3: StolenWalletRegistry → 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
///   4: (setRegistry tx)
abstract contract DeployBase is Script {
    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCK TIMING CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get timing configuration for a chain
    /// @dev Block counts adjusted per-chain for consistent UX (~2 min grace, ~10 min deadline)
    ///
    ///      | Chain          | Block Time | Grace Blocks | Deadline Blocks | Result           |
    ///      |----------------|------------|--------------|-----------------|------------------|
    ///      | Anvil (local)  | 13s        | 10           | 50              | ~2 min / ~10 min |
    ///      | Base/Optimism  | 2s         | 60           | 300             | ~2 min / ~10 min |
    ///      | Arbitrum       | 0.25s      | 480          | 2400            | ~2 min / ~10 min |
    ///      | Ethereum L1    | 12s        | 10           | 50              | ~2 min / ~10 min |
    ///
    /// @param chainId The chain ID to get timing config for
    /// @return graceBlocks Base blocks for grace period
    /// @return deadlineBlocks Base blocks for deadline window
    function getTimingConfig(uint256 chainId) internal pure returns (uint256 graceBlocks, uint256 deadlineBlocks) {
        // Anvil/Local (13s blocks)
        if (chainId == 31_337 || chainId == 31_338) {
            return (10, 50);
        }

        // Base mainnet/Sepolia (2s blocks)
        if (chainId == 8453 || chainId == 84_532) {
            return (60, 300);
        }

        // Optimism mainnet/Sepolia (2s blocks)
        if (chainId == 10 || chainId == 11_155_420) {
            return (60, 300);
        }

        // Arbitrum One/Sepolia (0.25s blocks)
        if (chainId == 42_161 || chainId == 421_614) {
            return (480, 2400);
        }

        // Polygon mainnet/Amoy (2s blocks)
        if (chainId == 137 || chainId == 80_002) {
            return (60, 300);
        }

        // Ethereum L1 mainnet (12s blocks)
        if (chainId == 1) {
            return (10, 50);
        }

        // Unknown chain - revert to force explicit configuration
        revert("DeployBase: unsupported chain ID - add timing config");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAINLINK PRICE FEEDS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get Chainlink ETH/USD feed address for a chain
    /// @dev See: https://docs.chain.link/data-feeds/price-feeds/addresses
    function getChainlinkFeed(uint256 chainId) internal pure returns (address) {
        if (chainId == 1) return 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419; // Ethereum Mainnet
        if (chainId == 8453) return 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70; // Base
        if (chainId == 84_532) return 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1; // Base Sepolia
        if (chainId == 11_155_420) return address(0); // Optimism Sepolia - no official feed, use MockAggregator
        if (chainId == 42_161) return 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612; // Arbitrum
        if (chainId == 10) return 0x13e3Ee699D1909E989722E753853AE30b17e08c5; // Optimism
        if (chainId == 137) return 0xF9680D99D6C9589e2a93a78A04A279e509205945; // Polygon
        if (chainId == 11_155_111) return 0x694AA1769357215DE4FAC081bf1f309aDC325306; // Sepolia
        return address(0); // Local/unknown chains: deploy mock
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CORE DEPLOYMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Deploy core SWR contracts (shared between single-chain and cross-chain)
    /// @param deployer The deployer/owner address
    /// @param crossChainInbox Optional cross-chain inbox address (address(0) for single-chain)
    /// @return priceFeed The price feed address (mock or Chainlink)
    /// @return feeManager The FeeManager address
    /// @return hub The RegistryHub address
    /// @return registry The StolenWalletRegistry address
    function deployCore(address deployer, address crossChainInbox)
        internal
        returns (address priceFeed, address feeManager, address payable hub, address registry)
    {
        uint256 chainId = block.chainid;

        // Get chain-specific timing configuration
        (uint256 graceBlocks, uint256 deadlineBlocks) = getTimingConfig(chainId);
        console2.log("Timing Config - Grace Blocks:", graceBlocks);
        console2.log("Timing Config - Deadline Blocks:", deadlineBlocks);

        // nonce 0: Deploy price feed (mock for local, Chainlink for mainnet/testnet)
        priceFeed = getChainlinkFeed(chainId);
        if (priceFeed == address(0)) {
            priceFeed = address(new MockAggregator(350_000_000_000)); // $3500 ETH
            console2.log("MockAggregator:", priceFeed);
        } else {
            console2.log("Chainlink Feed:", priceFeed);
        }

        // nonce 1: Deploy FeeManager
        feeManager = address(new FeeManager(deployer, priceFeed));
        console2.log("FeeManager:", feeManager);

        // nonce 2: Deploy RegistryHub
        RegistryHub hubContract = new RegistryHub(deployer, feeManager, crossChainInbox);
        hub = payable(address(hubContract));
        console2.log("RegistryHub:", hub);

        // nonce 3: Deploy StolenWalletRegistry (with chain-specific timing)
        registry = address(new StolenWalletRegistry(feeManager, hub, graceBlocks, deadlineBlocks));
        console2.log("StolenWalletRegistry:", registry);

        // nonce 4: Wire up hub to registry
        hubContract.setRegistry(hubContract.STOLEN_WALLET(), registry);
    }
}

/// @notice Minimal mock aggregator for local deployment
contract MockAggregator {
    int256 public price;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }

    /// @notice Update the mock price (useful for testing price changes)
    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 _updatedAt, uint80 answeredInRound)
    {
        return (0, price, 0, updatedAt, 0);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "ETH / USD (Mock)";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 _updatedAt, uint80 answeredInRound)
    {
        return (0, price, 0, updatedAt, 0);
    }
}
