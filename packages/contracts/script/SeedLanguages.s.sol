// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";

/// @title SeedLanguages
/// @notice Seeds the TranslationRegistry with supported languages
/// @dev Run after deploying contracts to keep addresses deterministic
///
/// Usage:
/// ```bash
/// # Local (after deploy:crosschain)
/// pnpm seed:languages
///
/// # Or with custom registry address
/// TRANSLATION_REGISTRY=0x... forge script script/SeedLanguages.s.sol --rpc-url localhost --broadcast
/// ```
contract SeedLanguages is Script {
    // Default local anvil address (regular CREATE, nonce-based from Deploy.s.sol)
    address constant DEFAULT_TRANSLATION_REGISTRY = 0x3Aa5ebB10DC797CAC828524e59A333d0A371443c;

    function run() external {
        // Use same deployer key as DeployCrossChain (Anvil account 0)
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        address registryAddr = vm.envOr("TRANSLATION_REGISTRY", DEFAULT_TRANSLATION_REGISTRY);

        console2.log("=== SEED LANGUAGES ===");
        console2.log("TranslationRegistry:", registryAddr);

        TranslationRegistry registry = TranslationRegistry(registryAddr);

        // Check if already seeded (Spanish would exist if seeded)
        if (registry.isLanguageSupported("es")) {
            console2.log("Languages already seeded, skipping...");
            return;
        }

        vm.startBroadcast(deployerPrivateKey);

        // Spanish
        registry.addLanguage(
            "es",
            "CARTERA ROBADA",
            "Firmado como robado",
            "Gracias por tu apoyo",
            unicode"No envíe fondos a esta dirección",
            "Registro de Carteras Robadas"
        );
        console2.log("  Added: es (Spanish)");

        // Chinese (Simplified)
        registry.addLanguage(
            "zh",
            unicode"被盗钱包",
            unicode"已签名为被盗",
            unicode"感谢您的支持",
            unicode"请勿向此地址发送资金",
            unicode"被盗钱包登记处"
        );
        console2.log("  Added: zh (Chinese)");

        // French
        registry.addLanguage(
            "fr",
            unicode"PORTEFEUILLE VOLÉ",
            unicode"Signé comme volé",
            "Merci pour votre soutien",
            unicode"N'envoyez pas de fonds à cette adresse",
            "Registre des Portefeuilles Voles"
        );
        console2.log("  Added: fr (French)");

        // German
        registry.addLanguage(
            "de",
            "GESTOHLENE WALLET",
            "Als gestohlen signiert",
            unicode"Danke für Ihre Unterstützung",
            "Senden Sie keine Gelder an diese Adresse",
            "Gestohlene Wallet Registrierung"
        );
        console2.log("  Added: de (German)");

        // Japanese
        registry.addLanguage(
            "ja",
            unicode"盗まれたウォレット",
            unicode"盗難として署名済み",
            unicode"ご支援ありがとうございます",
            unicode"このアドレスに資金を送らないでください",
            unicode"盗難ウォレット登録"
        );
        console2.log("  Added: ja (Japanese)");

        // Korean
        registry.addLanguage(
            "ko",
            unicode"도난된 지갑",
            unicode"도난으로 서명됨",
            unicode"지원해 주셔서 감사합니다",
            unicode"이 주소로 자금을 보내지 마세요",
            unicode"도난 지갑 등록소"
        );
        console2.log("  Added: ko (Korean)");

        // Portuguese
        registry.addLanguage(
            "pt",
            "CARTEIRA ROUBADA",
            "Assinado como roubado",
            "Obrigado pelo seu apoio",
            unicode"Não envie fundos para este endereço",
            "Registro de Carteiras Roubadas"
        );
        console2.log("  Added: pt (Portuguese)");

        // Russian
        registry.addLanguage(
            "ru",
            unicode"УКРАДЕННЫЙ КОШЕЛЕК",
            unicode"Подписано как украденное",
            unicode"Спасибо за вашу поддержку",
            unicode"Не отправляйте средства на этот адрес",
            unicode"Реестр украденных кошельков"
        );
        console2.log("  Added: ru (Russian)");

        // Arabic
        registry.addLanguage(
            "ar",
            unicode"محفظة مسروقة",
            unicode"موقعة كمسروقة",
            unicode"شكرا لدعمك",
            unicode"لا ترسل أموالاً إلى هذا العنوان",
            unicode"سجل المحافظ المسروقة"
        );
        console2.log("  Added: ar (Arabic)");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== SEEDING COMPLETE ===");
        console2.log("Total languages: 10 (including default English)");
    }
}
