// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";

/// @title Deploy Script for Stolen Wallet Registry
/// @notice Deploys the full registry system: StolenWalletRegistry, FeeManager, RegistryHub
/// @dev Usage:
///   Local:   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   Testnet: forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
contract Deploy is Script {
    // Chainlink ETH/USD feed addresses by chain
    // See: https://docs.chain.link/data-feeds/price-feeds/addresses
    function getChainlinkFeed(uint256 chainId) internal pure returns (address) {
        if (chainId == 1) return 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419; // Ethereum Mainnet
        if (chainId == 8453) return 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70; // Base
        if (chainId == 84_532) return 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1; // Base Sepolia
        if (chainId == 42_161) return 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612; // Arbitrum
        if (chainId == 10) return 0x13e3Ee699D1909E989722E753853AE30b17e08c5; // Optimism
        if (chainId == 137) return 0xF9680D99D6C9589e2a93a78A04A279e509205945; // Polygon
        if (chainId == 11_155_111) return 0x694AA1769357215DE4FAC081bf1f309aDC325306; // Sepolia
        return address(0); // Local/unknown chains: manual-only mode
    }

    function run() external {
        // Use default anvil private key if not set
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;

        console.log("Deploying to chain:", chainId);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Get price feed address (or deploy mock for local)
        address priceFeed = getChainlinkFeed(chainId);
        if (priceFeed == address(0)) {
            // Local development: deploy mock aggregator
            MockAggregatorForDeploy mock = new MockAggregatorForDeploy(350_000_000_000); // $3500 ETH
            priceFeed = address(mock);
            console.log("MockAggregator deployed:", priceFeed);
        } else {
            console.log("Using Chainlink feed:", priceFeed);
        }

        // 2. Deploy FeeManager with price feed
        FeeManager feeManager = new FeeManager(deployer, priceFeed);
        console.log("FeeManager:", address(feeManager));

        // 3. Deploy RegistryHub (with feeManager, no registry yet - will be set after)
        RegistryHub hub = new RegistryHub(deployer, address(feeManager), address(0));
        console.log("RegistryHub:", address(hub));

        // 4. Deploy StolenWalletRegistry with feeManager and registryHub for fee collection
        StolenWalletRegistry registry = new StolenWalletRegistry(address(feeManager), address(hub));
        console.log("StolenWalletRegistry:", address(registry));

        // 5. Wire up hub to registry
        hub.setRegistry(hub.STOLEN_WALLET(), address(registry));
        console.log("RegistryHub wired to StolenWalletRegistry");

        vm.stopBroadcast();

        // Summary
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Chain ID:", chainId);
        console.log("StolenWalletRegistry:", address(registry));
        console.log("FeeManager:", address(feeManager));
        console.log("RegistryHub:", address(hub));
        console.log("Price Feed:", priceFeed);
        console.log("Current Fee (wei):", feeManager.currentFeeWei());
    }
}

/// @notice Minimal mock aggregator for local deployment
/// @dev Only used when deploying to local Anvil chain
contract MockAggregatorForDeploy {
    int256 public price;
    uint256 public updatedAt;

    constructor(int256 _price) {
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
