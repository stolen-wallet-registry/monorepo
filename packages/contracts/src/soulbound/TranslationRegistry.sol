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
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Maximum number of supported languages
    uint256 public constant MAX_LANGUAGES = 50;

    /// @notice Maximum byte length for any text field
    uint256 public constant MAX_STRING_LENGTH = 256;

    /// @dev Pre-computed key hashes for gas-efficient lookups
    // solhint-disable private-vars-leading-underscore
    bytes32 private constant KEY_TITLE = keccak256("title");
    bytes32 private constant KEY_SUBTITLE = keccak256("subtitle");
    bytes32 private constant KEY_WARNING = keccak256("warning");
    bytes32 private constant KEY_SUPPORT_SUBTITLE = keccak256("supportSubtitle");
    bytes32 private constant KEY_FOOTER = keccak256("footer");

    // solhint-enable private-vars-leading-underscore

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Language pack containing all translated strings
    struct LanguagePack {
        string title; // "STOLEN WALLET" / "CARTERA ROBADA"
        string subtitle; // "Signed as stolen" (for wallet soulbound)
        string supportSubtitle; // "Thank you for your support" (for support soulbound)
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

    /// @notice Thrown when MAX_LANGUAGES cap is reached
    error MaxLanguagesReached();

    /// @notice Thrown when a text field exceeds MAX_STRING_LENGTH bytes
    error StringTooLong();

    /// @notice Thrown when trying to remove a language that does not exist
    error LanguageNotFound(string languageCode);

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new language is added
    /// @param languageCode The ISO 639-1 language code added
    event LanguageAdded(string indexed languageCode);

    /// @notice Emitted when an existing language is updated
    /// @param languageCode The ISO 639-1 language code updated
    event LanguageUpdated(string indexed languageCode);

    /// @notice Emitted when a language is removed
    /// @param languageCode The ISO 639-1 language code removed
    event LanguageRemoved(string indexed languageCode);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(address _initialOwner) Ownable(_initialOwner) {
        // Initialize with English as default
        _addLanguageInternal(
            "en",
            LanguagePack({
                title: "STOLEN WALLET",
                subtitle: "Signed as stolen",
                supportSubtitle: "Thank you for your support",
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
    /// @param subtitle The subtitle text (wallet soulbound)
    /// @param supportSubtitle The subtitle text (support soulbound)
    /// @param warning The warning text
    /// @param footer The footer text
    function addLanguage(
        string calldata languageCode,
        string calldata title,
        string calldata subtitle,
        string calldata supportSubtitle,
        string calldata warning,
        string calldata footer
    ) external onlyOwner {
        if (bytes(languageCode).length == 0) revert EmptyLanguageCode();
        if (_languages[languageCode].exists) revert LanguageAlreadyExists(languageCode);
        if (_supportedLanguages.length >= MAX_LANGUAGES) revert MaxLanguagesReached();
        _validateStringLengths(title, subtitle, supportSubtitle, warning, footer);

        _addLanguageInternal(
            languageCode,
            LanguagePack({
                title: title,
                subtitle: subtitle,
                supportSubtitle: supportSubtitle,
                warning: warning,
                footer: footer,
                exists: true
            })
        );
    }

    /// @notice Update existing language translations (owner only)
    /// @param languageCode ISO 639-1 code of existing language
    /// @param title The title text
    /// @param subtitle The subtitle text (wallet soulbound)
    /// @param supportSubtitle The subtitle text (support soulbound)
    /// @param warning The warning text
    /// @param footer The footer text
    function updateLanguage(
        string calldata languageCode,
        string calldata title,
        string calldata subtitle,
        string calldata supportSubtitle,
        string calldata warning,
        string calldata footer
    ) external onlyOwner {
        if (!_languages[languageCode].exists) revert LanguageNotSupported(languageCode);
        _validateStringLengths(title, subtitle, supportSubtitle, warning, footer);

        _languages[languageCode] = LanguagePack({
            title: title,
            subtitle: subtitle,
            supportSubtitle: supportSubtitle,
            warning: warning,
            footer: footer,
            exists: true
        });

        emit LanguageUpdated(languageCode);
    }

    /// @notice Remove a language (owner only)
    /// @param languageCode ISO 639-1 code of language to remove
    function removeLanguage(string calldata languageCode) external onlyOwner {
        if (!_languages[languageCode].exists) revert LanguageNotFound(languageCode);

        // Remove from _supportedLanguages array (swap-and-pop)
        uint256 len = _supportedLanguages.length;
        for (uint256 i = 0; i < len; i++) {
            if (keccak256(bytes(_supportedLanguages[i])) == keccak256(bytes(languageCode))) {
                _supportedLanguages[i] = _supportedLanguages[len - 1];
                _supportedLanguages.pop();
                break;
            }
        }

        delete _languages[languageCode];
        emit LanguageRemoved(languageCode);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ITranslationRegistry
    function getTranslation(string calldata languageCode, string calldata key) external view returns (string memory) {
        LanguagePack storage pack = _languages[languageCode];
        if (!pack.exists) revert LanguageNotSupported(languageCode);

        bytes32 keyHash = keccak256(bytes(key));
        if (keyHash == KEY_TITLE) return pack.title;
        if (keyHash == KEY_SUBTITLE) return pack.subtitle;
        if (keyHash == KEY_SUPPORT_SUBTITLE) return pack.supportSubtitle;
        if (keyHash == KEY_WARNING) return pack.warning;
        if (keyHash == KEY_FOOTER) return pack.footer;

        return ""; // Unknown key returns empty
    }

    /// @inheritdoc ITranslationRegistry
    function getLanguage(string calldata languageCode)
        external
        view
        returns (
            string memory title,
            string memory subtitle,
            string memory supportSubtitle,
            string memory warning,
            string memory footer
        )
    {
        LanguagePack storage pack = _languages[languageCode];
        if (!pack.exists) revert LanguageNotSupported(languageCode);
        return (pack.title, pack.subtitle, pack.supportSubtitle, pack.warning, pack.footer);
    }

    /// @inheritdoc ITranslationRegistry
    function isLanguageSupported(string calldata languageCode) external view returns (bool) {
        return _languages[languageCode].exists;
    }

    /// @inheritdoc ITranslationRegistry
    function getSupportedLanguages() external view returns (string[] memory) {
        return _supportedLanguages;
    }

    /// @inheritdoc ITranslationRegistry
    function getAllSubtitles() external view returns (string[] memory codes, string[] memory subtitles) {
        uint256 len = _supportedLanguages.length;
        codes = new string[](len);
        subtitles = new string[](len);

        for (uint256 i = 0; i < len; i++) {
            string memory code = _supportedLanguages[i];
            codes[i] = code;
            subtitles[i] = _languages[code].subtitle;
        }
    }

    /// @inheritdoc ITranslationRegistry
    function getAllSupportSubtitles() external view returns (string[] memory codes, string[] memory supportSubtitles) {
        uint256 len = _supportedLanguages.length;
        codes = new string[](len);
        supportSubtitles = new string[](len);

        for (uint256 i = 0; i < len; i++) {
            string memory code = _supportedLanguages[i];
            codes[i] = code;
            supportSubtitles[i] = _languages[code].supportSubtitle;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Internal function to add a language pack
    /// @param languageCode The ISO 639-1 language code
    /// @param pack The language pack containing all translations
    function _addLanguageInternal(string memory languageCode, LanguagePack memory pack) internal {
        _languages[languageCode] = pack;
        _supportedLanguages.push(languageCode);
        emit LanguageAdded(languageCode);
    }

    /// @dev Validate all text fields are within MAX_STRING_LENGTH
    function _validateStringLengths(
        string calldata title,
        string calldata subtitle,
        string calldata supportSubtitle,
        string calldata warning,
        string calldata footer
    ) internal pure {
        if (bytes(title).length > MAX_STRING_LENGTH) revert StringTooLong();
        if (bytes(subtitle).length > MAX_STRING_LENGTH) revert StringTooLong();
        if (bytes(supportSubtitle).length > MAX_STRING_LENGTH) revert StringTooLong();
        if (bytes(warning).length > MAX_STRING_LENGTH) revert StringTooLong();
        if (bytes(footer).length > MAX_STRING_LENGTH) revert StringTooLong();
    }
}
