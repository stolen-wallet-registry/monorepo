// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IMulticall3 } from "forge-std/interfaces/IMulticall3.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { Create2Deployer } from "./Create2Deployer.sol";
import { Salts } from "./Salts.sol";

/// @title DeployBase
/// @notice Shared deployment utilities (timing config, Chainlink feeds, Multicall3, soulbound)
/// @dev Inherit from this to ensure consistent configuration across deploy scripts.
abstract contract DeployBase is Script {
    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCK TIMING CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get timing configuration for a chain
    /// @dev Block counts adjusted per-chain for consistent UX (~2 min grace, ~10 min deadline)
    ///
    ///      | Chain          | Block Time | Grace Blocks | Deadline Blocks | Result           |
    ///      |----------------|------------|--------------|-----------------|------------------|
    ///      | Anvil (local)  | 13s        | 2            | 12              | ~30s / ~2.5 min  |
    ///      | Base/Optimism  | 2s         | 60           | 300             | ~2 min / ~10 min |
    ///      | Arbitrum       | 0.25s      | 480          | 2400            | ~2 min / ~10 min |
    ///      | Ethereum L1    | 12s        | 10           | 50              | ~2 min / ~10 min |
    ///
    /// @param chainId The chain ID to get timing config for
    /// @return graceBlocks Base blocks for grace period
    /// @return deadlineBlocks Base blocks for deadline window
    function getTimingConfig(uint256 chainId) internal pure returns (uint256 graceBlocks, uint256 deadlineBlocks) {
        // Anvil/Local (13s blocks) - ~30s grace, ~10 min registration window
        if (chainId == 31_337 || chainId == 31_338) {
            return (2, 50);
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

    /// @notice Canonical Multicall3 address (pre-deployed on all major chains)
    /// @dev See https://www.multicall3.com for deployment addresses
    address internal constant CANONICAL_MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;

    /// @notice Deploy Multicall3 for local chains (mainnet/testnets have it pre-deployed)
    /// @param salt CREATE2 salt (use Salts.MULTICALL3 for hub, Salts.MULTICALL3_SPOKE for spoke)
    /// @return multicall3 The deployed Multicall3 address
    function deployMulticall3(bytes32 salt) internal returns (address multicall3) {
        // On mainnet/testnets, Multicall3 is deployed at canonical address
        // Only deploy for local chains
        if (block.chainid == 31_337 || block.chainid == 31_338) {
            multicall3 = Create2Deployer.deploy(salt, type(Multicall3).creationCode);
            console2.log("Multicall3:", multicall3);
        } else {
            // Use canonical Multicall3 address on all other chains
            multicall3 = CANONICAL_MULTICALL3;
            console2.log("Multicall3 (canonical):", multicall3);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SOULBOUND DEPLOYMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum donation for SupportSoulbound (spam prevention)
    /// @dev ~$0.25 at $2500/ETH - very low to not discourage small donations
    uint256 internal constant MIN_DONATION = 0.0001 ether;

    /// @notice Default domain for soulbound SVG display
    string internal constant DEFAULT_DOMAIN = "stolenwallet.xyz";

    /// @notice Deploy soulbound token contracts with default domain and default salts
    /// @param registry The StolenWalletRegistry address (for WalletSoulbound gate)
    /// @param feeCollector The address to receive withdrawn fees (typically RegistryHub)
    /// @param initialOwner The address that will own the deployed contracts
    /// @return translations The TranslationRegistry address
    /// @return walletSoulbound The WalletSoulbound address
    /// @return supportSoulbound The SupportSoulbound address
    function deploySoulbound(address registry, address feeCollector, address initialOwner)
        internal
        returns (address translations, address walletSoulbound, address supportSoulbound)
    {
        return deploySoulbound(
            registry,
            feeCollector,
            initialOwner,
            DEFAULT_DOMAIN,
            Salts.TRANSLATION_REGISTRY,
            Salts.WALLET_SOULBOUND,
            Salts.SUPPORT_SOULBOUND
        );
    }

    /// @notice Deploy soulbound token contracts with custom domain via CREATE2
    /// @param registry The StolenWalletRegistry address (for WalletSoulbound gate)
    /// @param feeCollector The address to receive withdrawn fees (typically RegistryHub)
    /// @param initialOwner The address that will own the deployed contracts
    /// @param domain The domain to display in SVG (e.g., "stolenwallet.xyz")
    /// @param translationSalt CREATE2 salt for TranslationRegistry
    /// @param walletSbSalt CREATE2 salt for WalletSoulbound
    /// @param supportSbSalt CREATE2 salt for SupportSoulbound
    /// @return translations The TranslationRegistry address
    /// @return walletSoulbound The WalletSoulbound address
    /// @return supportSoulbound The SupportSoulbound address
    function deploySoulbound(
        address registry,
        address feeCollector,
        address initialOwner,
        string memory domain,
        bytes32 translationSalt,
        bytes32 walletSbSalt,
        bytes32 supportSbSalt
    ) internal returns (address translations, address walletSoulbound, address supportSoulbound) {
        require(registry != address(0), "DeployBase: registry is zero address");
        require(feeCollector != address(0), "DeployBase: feeCollector is zero address");
        require(initialOwner != address(0), "DeployBase: initialOwner is zero address");

        console2.log("");
        console2.log("=== SOULBOUND DEPLOYMENT ===");
        console2.log("Domain:", domain);

        // Deploy TranslationRegistry (no dependencies)
        // Note: Languages are seeded separately via SeedLanguages.s.sol to keep addresses deterministic
        translations = Create2Deployer.deploy(
            translationSalt, abi.encodePacked(type(TranslationRegistry).creationCode, abi.encode(initialOwner))
        );
        console2.log("TranslationRegistry:", translations);

        // Deploy WalletSoulbound (gated by registry)
        walletSoulbound = Create2Deployer.deploy(
            walletSbSalt,
            abi.encodePacked(
                type(WalletSoulbound).creationCode,
                abi.encode(registry, translations, feeCollector, domain, initialOwner)
            )
        );
        console2.log("WalletSoulbound:", walletSoulbound);

        // Deploy SupportSoulbound (donation-based, no gate)
        supportSoulbound = Create2Deployer.deploy(
            supportSbSalt,
            abi.encodePacked(
                type(SupportSoulbound).creationCode,
                abi.encode(MIN_DONATION, translations, feeCollector, domain, initialOwner)
            )
        );
        console2.log("SupportSoulbound:", supportSoulbound);
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

/// @notice Multicall3 - Aggregate multiple contract calls into a single call
/// @dev Minimal implementation of IMulticall3 from forge-std for local Anvil deployment.
///      Canonical Multicall3 is pre-deployed at 0xcA11bde05977b3631167028862bE2a173976CA11 on most chains.
///      See https://www.multicall3.com for full implementation and deployment info.
contract Multicall3 is IMulticall3 {
    /// @inheritdoc IMulticall3
    function aggregate(Call[] calldata calls)
        external
        payable
        returns (uint256 blockNumber, bytes[] memory returnData)
    {
        blockNumber = block.number;
        returnData = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            require(success, "Multicall3: call failed");
            returnData[i] = ret;
        }
    }

    /// @inheritdoc IMulticall3
    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData) {
        returnData = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if (!success && !calls[i].allowFailure) {
                assembly { revert(add(ret, 32), mload(ret)) }
            }
            returnData[i] = Result({ success: success, returnData: ret });
        }
    }

    /// @inheritdoc IMulticall3
    function aggregate3Value(Call3Value[] calldata calls) external payable returns (Result[] memory returnData) {
        uint256 valLeft = msg.value;
        returnData = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            uint256 val = calls[i].value;
            require(val <= valLeft, "Multicall3: value exceeds balance");
            valLeft -= val;
            (bool success, bytes memory ret) = calls[i].target.call{ value: val }(calls[i].callData);
            if (!success && !calls[i].allowFailure) {
                assembly { revert(add(ret, 32), mload(ret)) }
            }
            returnData[i] = Result({ success: success, returnData: ret });
        }
        // Refund any excess ETH to caller
        if (valLeft > 0) {
            (bool refundSuccess,) = msg.sender.call{ value: valLeft }("");
            require(refundSuccess, "Multicall3: ETH refund failed");
        }
    }

    /// @inheritdoc IMulticall3
    function blockAndAggregate(Call[] calldata calls)
        external
        payable
        returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)
    {
        blockNumber = block.number;
        blockHash = blockhash(block.number - 1);
        returnData = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            require(success, "Multicall3: call failed");
            returnData[i] = Result({ success: success, returnData: ret });
        }
    }

    /// @inheritdoc IMulticall3
    function tryAggregate(bool requireSuccess, Call[] calldata calls)
        external
        payable
        returns (Result[] memory returnData)
    {
        returnData = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if (requireSuccess) require(success, "Multicall3: call failed");
            returnData[i] = Result({ success: success, returnData: ret });
        }
    }

    /// @inheritdoc IMulticall3
    function tryBlockAndAggregate(bool requireSuccess, Call[] calldata calls)
        external
        payable
        returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)
    {
        blockNumber = block.number;
        blockHash = blockhash(block.number - 1);
        returnData = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if (requireSuccess) require(success, "Multicall3: call failed");
            returnData[i] = Result({ success: success, returnData: ret });
        }
    }

    /// @inheritdoc IMulticall3
    function getBasefee() external view returns (uint256 basefee) {
        basefee = block.basefee;
    }

    /// @inheritdoc IMulticall3
    function getBlockHash(uint256 blockNumber) external view returns (bytes32 blockHash) {
        blockHash = blockhash(blockNumber);
    }

    /// @inheritdoc IMulticall3
    function getBlockNumber() external view returns (uint256 blockNumber) {
        blockNumber = block.number;
    }

    /// @inheritdoc IMulticall3
    function getChainId() external view returns (uint256 chainid) {
        chainid = block.chainid;
    }

    /// @inheritdoc IMulticall3
    function getCurrentBlockCoinbase() external view returns (address coinbase) {
        coinbase = block.coinbase;
    }

    /// @inheritdoc IMulticall3
    function getCurrentBlockDifficulty() external view returns (uint256 difficulty) {
        difficulty = block.prevrandao;
    }

    /// @inheritdoc IMulticall3
    function getCurrentBlockGasLimit() external view returns (uint256 gaslimit) {
        gaslimit = block.gaslimit;
    }

    /// @inheritdoc IMulticall3
    function getCurrentBlockTimestamp() external view returns (uint256 timestamp) {
        timestamp = block.timestamp;
    }

    /// @inheritdoc IMulticall3
    function getEthBalance(address addr) external view returns (uint256 balance) {
        balance = addr.balance;
    }

    /// @inheritdoc IMulticall3
    function getLastBlockHash() external view returns (bytes32 blockHash) {
        blockHash = blockhash(block.number - 1);
    }
}
