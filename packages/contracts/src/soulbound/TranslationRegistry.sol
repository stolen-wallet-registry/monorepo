// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ITranslationRegistry } from "./interfaces/ITranslationRegistry.sol";

/// @title TranslationRegistry
/// @notice Stores multilingual strings for soulbound token SVGs
/// @dev Deploy once, reference from all soulbound contracts - gas efficient
/// @author Stolen Wallet Registry Team
contract TranslationRegistry is ITranslationRegistry, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Language pack containing all translated strings
    struct LanguagePack {
        string title; // "STOLEN WALLET" / "CARTERA ROBADA"
        string subtitle; // "This wallet has been reported stolen"
        string warning; // "Do not send funds to this address"
        string footer; // "Stolen Wallet Registry"
        bool exists;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Language code to translations mapping
    mapping(string languageCode => LanguagePack) private _languages;

    /// @dev Array of all supported language codes for enumeration
    string[] private _supportedLanguages;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when querying an unsupported language
    error LanguageNotSupported(string languageCode);

    /// @notice Thrown when trying to add a language that already exists
    error LanguageAlreadyExists(string languageCode);

    /// @notice Thrown when language code is empty
    error EmptyLanguageCode();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new language is added
    event LanguageAdded(string indexed languageCode);

    /// @notice Emitted when an existing language is updated
    event LanguageUpdated(string indexed languageCode);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor() Ownable(msg.sender) {
        // Initialize with English as default
        _addLanguageInternal(
            "en",
            LanguagePack({
                title: "STOLEN WALLET",
                subtitle: "This wallet has been reported stolen",
                warning: "Do not send funds to this address",
                footer: "Stolen Wallet Registry",
                exists: true
            })
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Add a new language (owner only)
    /// @param languageCode ISO 639-1 code (e.g., "es", "zh", "fr")
    /// @param title The title text
    /// @param subtitle The subtitle text
    /// @param warning The warning text
    /// @param footer The footer text
    function addLanguage(
        string calldata languageCode,
        string calldata title,
        string calldata subtitle,
        string calldata warning,
        string calldata footer
    ) external onlyOwner {
        if (bytes(languageCode).length == 0) revert EmptyLanguageCode();
        if (_languages[languageCode].exists) revert LanguageAlreadyExists(languageCode);

        _addLanguageInternal(
            languageCode,
            LanguagePack({ title: title, subtitle: subtitle, warning: warning, footer: footer, exists: true })
        );
    }

    /// @notice Update existing language translations (owner only)
    /// @param languageCode ISO 639-1 code of existing language
    /// @param title The title text
    /// @param subtitle The subtitle text
    /// @param warning The warning text
    /// @param footer The footer text
    function updateLanguage(
        string calldata languageCode,
        string calldata title,
        string calldata subtitle,
        string calldata warning,
        string calldata footer
    ) external onlyOwner {
        if (!_languages[languageCode].exists) revert LanguageNotSupported(languageCode);

        _languages[languageCode] =
            LanguagePack({ title: title, subtitle: subtitle, warning: warning, footer: footer, exists: true });

        emit LanguageUpdated(languageCode);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITranslationRegistry
    function getTranslation(string calldata languageCode, string calldata key) external view returns (string memory) {
        LanguagePack storage pack = _languages[languageCode];
        if (!pack.exists) revert LanguageNotSupported(languageCode);

        bytes32 keyHash = keccak256(bytes(key));
        if (keyHash == keccak256("title")) return pack.title;
        if (keyHash == keccak256("subtitle")) return pack.subtitle;
        if (keyHash == keccak256("warning")) return pack.warning;
        if (keyHash == keccak256("footer")) return pack.footer;

        return ""; // Unknown key returns empty
    }

    /// @inheritdoc ITranslationRegistry
    function getLanguage(string calldata languageCode)
        external
        view
        returns (string memory title, string memory subtitle, string memory warning, string memory footer)
    {
        LanguagePack storage pack = _languages[languageCode];
        if (!pack.exists) revert LanguageNotSupported(languageCode);
        return (pack.title, pack.subtitle, pack.warning, pack.footer);
    }

    /// @inheritdoc ITranslationRegistry
    function isLanguageSupported(string calldata languageCode) external view returns (bool) {
        return _languages[languageCode].exists;
    }

    /// @inheritdoc ITranslationRegistry
    function getSupportedLanguages() external view returns (string[] memory) {
        return _supportedLanguages;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Internal function to add a language pack
    function _addLanguageInternal(string memory languageCode, LanguagePack memory pack) internal {
        _languages[languageCode] = pack;
        _supportedLanguages.push(languageCode);
        emit LanguageAdded(languageCode);
    }
}
