// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";

/// @title DeploySoulbound
/// @notice Deployment script for soulbound token contracts
/// @dev Deploy order: TranslationRegistry → WalletSoulbound → SupportSoulbound
///
/// Environment Variables Required:
/// - STOLEN_WALLET_REGISTRY: Address of the StolenWalletRegistry contract
/// - FEE_COLLECTOR: Address to receive withdrawn fees (can be RegistryHub or DAO treasury)
///
/// Usage:
/// ```bash
/// # Local development (requires anvil running)
/// forge script script/DeploySoulbound.s.sol --rpc-url localhost --broadcast
///
/// # Testnet (Base Sepolia)
/// forge script script/DeploySoulbound.s.sol --rpc-url base-sepolia --broadcast --verify
///
/// # Production (Base Mainnet)
/// forge script script/DeploySoulbound.s.sol --rpc-url base --broadcast --verify
/// ```
contract DeploySoulbound is Script {
    /// @notice Minimum donation for SupportSoulbound (spam prevention)
    /// @dev ~$0.25 at $2500/ETH - very low to not discourage small donations
    uint256 public constant MIN_DONATION = 0.0001 ether;

    function run() external {
        // Load required addresses from environment
        address registry = vm.envAddress("STOLEN_WALLET_REGISTRY");
        address feeCollector = vm.envAddress("FEE_COLLECTOR");

        console2.log("=== Soulbound Deployment ===");
        console2.log("Using StolenWalletRegistry:", registry);
        console2.log("Using FeeCollector:", feeCollector);
        console2.log("");

        vm.startBroadcast();

        // 1. Deploy TranslationRegistry (no dependencies)
        TranslationRegistry translations = new TranslationRegistry();
        console2.log("TranslationRegistry deployed:", address(translations));

        // 2. Seed initial languages (beyond English which is already seeded)
        _seedLanguages(translations);
        console2.log("Languages seeded: en, es, zh, fr, de, ja, ko, pt, ru, ar");

        // 3. Deploy WalletSoulbound
        WalletSoulbound walletSoulbound = new WalletSoulbound(registry, address(translations), feeCollector);
        console2.log("WalletSoulbound deployed:", address(walletSoulbound));

        // 4. Deploy SupportSoulbound
        SupportSoulbound supportSoulbound = new SupportSoulbound(MIN_DONATION, address(translations), feeCollector);
        console2.log("SupportSoulbound deployed:", address(supportSoulbound));

        vm.stopBroadcast();

        // Output summary for .env update
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Add to your .env:");
        console2.log("TRANSLATION_REGISTRY=", address(translations));
        console2.log("WALLET_SOULBOUND=", address(walletSoulbound));
        console2.log("SUPPORT_SOULBOUND=", address(supportSoulbound));
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
