// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IMulticall3 } from "forge-std/interfaces/IMulticall3.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";

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
///   5: Multicall3           → 0x9A676e781A523b5d0C0e43731313A708CB607508
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
        // Anvil/Local (13s blocks) - ~30s grace, ~2.5 min deadline for fast iteration
        if (chainId == 31_337 || chainId == 31_338) {
            return (2, 12);
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

    /// @notice Canonical Multicall3 address (pre-deployed on all major chains)
    /// @dev See https://www.multicall3.com for deployment addresses
    address internal constant CANONICAL_MULTICALL3 = 0xcA11bde05977b3631167028862bE2a173976CA11;

    /// @notice Deploy Multicall3 for local chains (mainnet/testnets have it pre-deployed)
    /// @dev Call this AFTER deployCore to maintain deterministic nonce ordering
    /// @return multicall3 The deployed Multicall3 address
    function deployMulticall3() internal returns (address multicall3) {
        // On mainnet/testnets, Multicall3 is deployed at canonical address
        // Only deploy for local chains
        if (block.chainid == 31_337 || block.chainid == 31_338) {
            // nonce 5: Deploy Multicall3
            multicall3 = address(new Multicall3());
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

    /// @notice Deploy soulbound token contracts
    /// @param registry The StolenWalletRegistry address (for WalletSoulbound gate)
    /// @param feeCollector The address to receive withdrawn fees (typically RegistryHub)
    /// @return translations The TranslationRegistry address
    /// @return walletSoulbound The WalletSoulbound address
    /// @return supportSoulbound The SupportSoulbound address
    function deploySoulbound(address registry, address feeCollector)
        internal
        returns (address translations, address walletSoulbound, address supportSoulbound)
    {
        require(registry != address(0), "DeployBase: registry is zero address");
        require(feeCollector != address(0), "DeployBase: feeCollector is zero address");

        console2.log("");
        console2.log("=== SOULBOUND DEPLOYMENT ===");

        // Deploy TranslationRegistry (no dependencies)
        translations = address(new TranslationRegistry());
        console2.log("TranslationRegistry:", translations);

        // Seed initial languages
        _seedLanguages(TranslationRegistry(translations));
        console2.log("Languages seeded: en, es, zh, fr, de, ja, ko, pt, ru, ar");

        // Deploy WalletSoulbound (gated by registry)
        walletSoulbound = address(new WalletSoulbound(registry, translations, feeCollector));
        console2.log("WalletSoulbound:", walletSoulbound);

        // Deploy SupportSoulbound (donation-based, no gate)
        supportSoulbound = address(new SupportSoulbound(MIN_DONATION, translations, feeCollector));
        console2.log("SupportSoulbound:", supportSoulbound);
    }

    /// @dev Seeds additional languages beyond the default English
    function _seedLanguages(TranslationRegistry t) internal {
        // Spanish
        t.addLanguage(
            "es",
            "CARTERA ROBADA",
            "Esta cartera ha sido reportada como robada",
            unicode"No envíe fondos a esta dirección",
            "Registro de Carteras Robadas"
        );

        // Chinese (Simplified)
        t.addLanguage(
            "zh",
            unicode"被盗钱包",
            unicode"此钱包已被报告被盗",
            unicode"请勿向此地址发送资金",
            unicode"被盗钱包登记处"
        );

        // French
        t.addLanguage(
            "fr",
            unicode"PORTEFEUILLE VOLÉ",
            unicode"Ce portefeuille a été signalé comme volé",
            unicode"N'envoyez pas de fonds à cette adresse",
            "Registre des Portefeuilles Voles"
        );

        // German
        t.addLanguage(
            "de",
            "GESTOHLENE WALLET",
            "Diese Wallet wurde als gestohlen gemeldet",
            "Senden Sie keine Gelder an diese Adresse",
            "Gestohlene Wallet Registrierung"
        );

        // Japanese
        t.addLanguage(
            "ja",
            unicode"盗まれたウォレット",
            unicode"このウォレットは盗難として報告されています",
            unicode"このアドレスに資金を送らないでください",
            unicode"盗難ウォレット登録"
        );

        // Korean
        t.addLanguage(
            "ko",
            unicode"도난 지갑",
            unicode"이 지갑은 도난 신고되었습니다",
            unicode"이 주소로 자금을 보내지 마세요",
            unicode"도난 지갑 등록소"
        );

        // Portuguese
        t.addLanguage(
            "pt",
            "CARTEIRA ROUBADA",
            "Esta carteira foi reportada como roubada",
            unicode"Não envie fundos para este endereço",
            "Registro de Carteiras Roubadas"
        );

        // Russian
        t.addLanguage(
            "ru",
            unicode"УКРАДЕННЫЙ КОШЕЛЕК",
            unicode"Этот кошелек был заявлен как украденный",
            unicode"Не отправляйте средства на этот адрес",
            unicode"Реестр Украденных Кошельков"
        );

        // Arabic
        t.addLanguage(
            "ar",
            unicode"محفظة مسروقة",
            unicode"تم الإبلاغ عن هذه المحفظة على أنها مسروقة",
            unicode"لا ترسل أموالاً إلى هذا العنوان",
            unicode"سجل المحافظ المسروقة"
        );
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
