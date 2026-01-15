// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITranslationRegistry
/// @notice Interface for multilingual string storage used by soulbound token SVGs
/// @dev Stores translations once, referenced by multiple soulbound contracts
interface ITranslationRegistry {
    /// @notice Get a specific translation string by key
    /// @param languageCode ISO 639-1 code (e.g., "en", "es", "zh")
    /// @param key Translation key (e.g., "title", "subtitle", "warning")
    /// @return The translated string, or empty if key not found
    function getTranslation(string calldata languageCode, string calldata key) external view returns (string memory);

    /// @notice Get all translations for a language pack
    /// @param languageCode ISO 639-1 code
    /// @return title The title text (e.g., "STOLEN WALLET")
    /// @return subtitle The subtitle text (e.g., "This wallet has been reported stolen")
    /// @return warning The warning text (e.g., "Do not send funds to this address")
    /// @return footer The footer text (e.g., "Stolen Wallet Registry")
    function getLanguage(string calldata languageCode)
        external
        view
        returns (string memory title, string memory subtitle, string memory warning, string memory footer);

    /// @notice Check if a language is supported
    /// @param languageCode ISO 639-1 code to check
    /// @return True if the language has translations registered
    function isLanguageSupported(string calldata languageCode) external view returns (bool);

    /// @notice Get list of all supported language codes
    /// @return Array of ISO 639-1 language codes
    function getSupportedLanguages() external view returns (string[] memory);

    /// @notice Get all languages with their subtitles for multi-language SVG rendering
    /// @dev Used by tokenURI to build SVG with systemLanguage switch elements
    /// @return codes Array of ISO 639-1 language codes
    /// @return subtitles Array of subtitle strings (parallel to codes array)
    function getAllSubtitles() external view returns (string[] memory codes, string[] memory subtitles);
}
