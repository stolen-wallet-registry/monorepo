// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseSoulbound } from "./BaseSoulbound.sol";
import { SVGRenderer } from "./libraries/SVGRenderer.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title SupportSoulbound
/// @notice Soulbound token for protocol supporters (donations)
/// @dev Unlimited per wallet, no registry gate, minimum donation enforced
/// @author Stolen Wallet Registry Team
///
/// Key Features:
/// - Unlimited mints per wallet (donation model)
/// - No registry gate - anyone can mint
/// - Minimum donation enforced (spam prevention)
/// - On-chain SVG artwork with multilingual support
/// - ERC-5192 compliant (non-transferable)
contract SupportSoulbound is BaseSoulbound {
    using Strings for uint256;
    using Strings for address;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum donation amount in wei (spam prevention)
    uint256 public minWei;

    /// @dev Amount donated per token
    mapping(uint256 tokenId => uint256) public tokenDonation;

    /// @dev Language preference per token
    mapping(uint256 tokenId => string) public tokenLanguage;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when donation is below minimum
    error BelowMinimum();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when minimum donation amount is updated
    event MinWeiUpdated(uint256 oldMin, uint256 newMin);

    /// @notice Emitted when a support soulbound token is minted
    /// @param tokenId The minted token ID
    /// @param supporter The address that minted
    /// @param amount The donation amount in wei
    /// @param language The language code for the SVG
    event SupportSoulboundMinted(uint256 indexed tokenId, address indexed supporter, uint256 amount, string language);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @param _minWei Minimum donation in wei (spam prevention)
    /// @param _translations Address of the TranslationRegistry contract
    /// @param _feeCollector Address to receive fees
    constructor(uint256 _minWei, address _translations, address _feeCollector)
        BaseSoulbound("SWR Support Soulbound", "SWRS", _translations, _feeCollector)
    {
        minWei = _minWei;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINT FUNCTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a support soulbound token
    /// @dev msg.value must be >= minWei (spam prevention).
    ///      User decides donation amount - UI suggests ~$25.
    /// @param language ISO 639-1 language code for SVG text
    function mint(string calldata language) external payable {
        if (msg.value < minWei) revert BelowMinimum();

        // Validate language (falls back to "en" if unsupported)
        string memory lang = translations.isLanguageSupported(language) ? language : "en";

        // Mint token to sender
        uint256 tokenId = _mintAndLock(msg.sender);

        // Store metadata
        tokenDonation[tokenId] = msg.value;
        tokenLanguage[tokenId] = lang;

        emit SupportSoulboundMinted(tokenId, msg.sender, msg.value, lang);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update minimum donation (owner only)
    /// @dev Allows adjusting for ETH price changes
    /// @param _minWei New minimum in wei
    function setMinWei(uint256 _minWei) external onlyOwner {
        uint256 oldMin = minWei;
        minWei = _minWei;
        emit MinWeiUpdated(oldMin, _minWei);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN URI (ON-CHAIN SVG)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Generate on-chain SVG metadata
    /// @param tokenId The token to get URI for
    /// @return Base64 encoded JSON metadata with embedded SVG
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        address supporter = ownerOf(tokenId);
        uint256 donation = tokenDonation[tokenId];
        string memory language = tokenLanguage[tokenId];

        // Get translations (reusing same pack, using title and footer)
        (string memory title,,, string memory footer) = translations.getLanguage(language);

        // Render SVG
        string memory svg = SVGRenderer.renderSupportSoulbound(supporter, tokenId, donation, title, footer);

        // Format donation for attributes
        string memory donationStr = _formatEtherAttribute(donation);

        // Build JSON metadata
        string memory json = string(
            abi.encodePacked(
                "{\"name\":\"SWR Support Soulbound #",
                tokenId.toString(),
                "\",\"description\":\"Thank you for supporting the Stolen Wallet Registry.",
                "\",\"image\":\"data:image/svg+xml;base64,",
                Base64.encode(bytes(svg)),
                "\",\"attributes\":[",
                "{\"trait_type\":\"Supporter\",\"value\":\"",
                Strings.toHexString(uint160(supporter), 20),
                "\"},{\"trait_type\":\"Donation\",\"value\":\"",
                donationStr,
                "\"},{\"trait_type\":\"Language\",\"value\":\"",
                language,
                "\"},{\"trait_type\":\"Type\",\"value\":\"Support Soulbound\"}",
                "]}"
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Format wei to ETH string for JSON attribute (no trailing space)
    function _formatEtherAttribute(uint256 weiAmount) internal pure returns (string memory) {
        uint256 eth = weiAmount / 1e18;
        uint256 remainder = weiAmount % 1e18;

        if (remainder == 0) {
            return string(abi.encodePacked(eth.toString(), " ETH"));
        }

        // Get up to 4 decimal places (1e14 = 0.0001 ETH precision)
        uint256 decimals = remainder / 1e14;

        // Remove trailing zeros
        while (decimals > 0 && decimals % 10 == 0) {
            decimals = decimals / 10;
        }

        if (decimals == 0) {
            return string(abi.encodePacked(eth.toString(), " ETH"));
        }

        return string(abi.encodePacked(eth.toString(), ".", decimals.toString(), " ETH"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get total donations received
    /// @return Total ETH donated (in wei)
    function totalDonations() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            total += tokenDonation[i];
        }
        return total;
    }

    /// @notice Get token IDs owned by an address
    /// @param supporter The address to look up
    /// @return tokenIds Array of token IDs owned
    function getTokensForSupporter(address supporter) external view returns (uint256[] memory tokenIds) {
        // First pass: count tokens
        uint256 count = 0;
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_ownerOf(i) == supporter) {
                count++;
            }
        }

        // Second pass: populate array
        tokenIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (_ownerOf(i) == supporter) {
                tokenIds[index++] = i;
            }
        }
    }
}
