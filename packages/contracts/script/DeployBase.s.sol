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
    // CHAINLINK PRICE FEEDS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get Chainlink ETH/USD feed address for a chain
    /// @dev See: https://docs.chain.link/data-feeds/price-feeds/addresses
    function getChainlinkFeed(uint256 chainId) internal pure returns (address) {
        if (chainId == 1) return 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419; // Ethereum Mainnet
        if (chainId == 8453) return 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70; // Base
        if (chainId == 84_532) return 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1; // Base Sepolia
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

        // nonce 3: Deploy StolenWalletRegistry
        registry = address(new StolenWalletRegistry(feeManager, hub));
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
