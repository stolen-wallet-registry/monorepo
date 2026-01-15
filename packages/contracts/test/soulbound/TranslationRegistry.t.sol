// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TranslationRegistry } from "../../src/soulbound/TranslationRegistry.sol";

/// @title TranslationRegistry Tests
/// @notice Tests for multilingual string storage contract
contract TranslationRegistryTest is Test {
    TranslationRegistry public registry;
    address public owner;
    address public nonOwner;

    function setUp() public {
        owner = address(this);
        nonOwner = makeAddr("nonOwner");
        registry = new TranslationRegistry();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Verify English is initialized by default
    function test_constructor_initializesEnglish() public view {
        assertTrue(registry.isLanguageSupported("en"));

        (string memory title, string memory subtitle, string memory warning, string memory footer) =
            registry.getLanguage("en");

        assertEq(title, "STOLEN WALLET");
        assertEq(subtitle, "This wallet has been reported stolen");
        assertEq(warning, "Do not send funds to this address");
        assertEq(footer, "Stolen Wallet Registry");
    }

    /// @notice Verify supported languages list starts with English
    function test_constructor_supportedLanguagesHasEnglish() public view {
        string[] memory languages = registry.getSupportedLanguages();
        assertEq(languages.length, 1);
        assertEq(languages[0], "en");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADD LANGUAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can add a new language
    function test_addLanguage_success() public {
        registry.addLanguage(
            "es", "CARTERA ROBADA", "Esta cartera ha sido reportada como robada", "No envie fondos", "Registro"
        );

        assertTrue(registry.isLanguageSupported("es"));

        (string memory title,,,) = registry.getLanguage("es");
        assertEq(title, "CARTERA ROBADA");
    }

    /// @notice Adding language emits event
    function test_addLanguage_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit TranslationRegistry.LanguageAdded("fr");

        registry.addLanguage("fr", "PORTEFEUILLE VOLE", "subtitle", "warning", "footer");
    }

    /// @notice Cannot add duplicate language
    function test_addLanguage_revert_alreadyExists() public {
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.LanguageAlreadyExists.selector, "en"));
        registry.addLanguage("en", "test", "test", "test", "test");
    }

    /// @notice Cannot add empty language code
    function test_addLanguage_revert_emptyCode() public {
        vm.expectRevert(TranslationRegistry.EmptyLanguageCode.selector);
        registry.addLanguage("", "test", "test", "test", "test");
    }

    /// @notice Non-owner cannot add language
    function test_addLanguage_revert_notOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        registry.addLanguage("de", "test", "test", "test", "test");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UPDATE LANGUAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can update existing language
    function test_updateLanguage_success() public {
        registry.updateLanguage("en", "NEW TITLE", "new subtitle", "new warning", "new footer");

        (string memory title, string memory subtitle, string memory warning, string memory footer) =
            registry.getLanguage("en");

        assertEq(title, "NEW TITLE");
        assertEq(subtitle, "new subtitle");
        assertEq(warning, "new warning");
        assertEq(footer, "new footer");
    }

    /// @notice Updating language emits event
    function test_updateLanguage_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit TranslationRegistry.LanguageUpdated("en");

        registry.updateLanguage("en", "NEW", "sub", "warn", "foot");
    }

    /// @notice Cannot update non-existent language
    function test_updateLanguage_revert_notSupported() public {
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.LanguageNotSupported.selector, "zz"));
        registry.updateLanguage("zz", "test", "test", "test", "test");
    }

    /// @notice Non-owner cannot update language
    function test_updateLanguage_revert_notOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        registry.updateLanguage("en", "test", "test", "test", "test");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GET TRANSLATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Can get individual translations by key
    function test_getTranslation_success() public view {
        assertEq(registry.getTranslation("en", "title"), "STOLEN WALLET");
        assertEq(registry.getTranslation("en", "subtitle"), "This wallet has been reported stolen");
        assertEq(registry.getTranslation("en", "warning"), "Do not send funds to this address");
        assertEq(registry.getTranslation("en", "footer"), "Stolen Wallet Registry");
    }

    /// @notice Unknown key returns empty string
    function test_getTranslation_unknownKey_returnsEmpty() public view {
        assertEq(registry.getTranslation("en", "unknown"), "");
    }

    /// @notice Unsupported language reverts
    function test_getTranslation_revert_unsupportedLanguage() public {
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.LanguageNotSupported.selector, "zz"));
        registry.getTranslation("zz", "title");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GET LANGUAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Unsupported language in getLanguage reverts
    function test_getLanguage_revert_unsupportedLanguage() public {
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.LanguageNotSupported.selector, "zz"));
        registry.getLanguage("zz");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // IS LANGUAGE SUPPORTED TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Returns true for supported language
    function test_isLanguageSupported_true() public view {
        assertTrue(registry.isLanguageSupported("en"));
    }

    /// @notice Returns false for unsupported language
    function test_isLanguageSupported_false() public view {
        assertFalse(registry.isLanguageSupported("zz"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPPORTED LANGUAGES ENUMERATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice getSupportedLanguages returns all added languages
    function test_getSupportedLanguages_multiple() public {
        registry.addLanguage("es", "ES", "es", "es", "es");
        registry.addLanguage("fr", "FR", "fr", "fr", "fr");
        registry.addLanguage("de", "DE", "de", "de", "de");

        string[] memory languages = registry.getSupportedLanguages();
        assertEq(languages.length, 4);
        assertEq(languages[0], "en");
        assertEq(languages[1], "es");
        assertEq(languages[2], "fr");
        assertEq(languages[3], "de");
    }
}
