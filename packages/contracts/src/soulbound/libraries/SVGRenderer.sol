// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// solhint-disable max-line-length
// solhint-disable function-max-lines
// solhint-disable gas-custom-errors

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title SVGRenderer
/// @notice Generates on-chain SVG artwork for soulbound tokens
/// @dev Uniswap-style animated SVG with text following rectangular border
/// @author Stolen Wallet Registry Team
library SVGRenderer {
    using Strings for uint256;
    using Strings for address;

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET SOULBOUND SVG (MULTILINGUAL)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Render SVG for WalletSoulbound token with ALL languages
    /// @dev Uses SVG <switch> with systemLanguage to auto-select user's language
    /// @param wallet The wallet address being marked as stolen
    /// @param tokenId The token ID
    /// @param domain The domain to display (e.g., "stolenwallet.xyz")
    /// @param langCodes Array of ISO 639-1 language codes
    /// @param subtitles Array of subtitle translations (parallel to langCodes)
    function renderWalletSoulbound(
        address wallet,
        uint256 tokenId,
        string memory domain,
        string[] memory langCodes,
        string[] memory subtitles
    ) internal pure returns (string memory) {
        // Build in parts to avoid stack too deep
        string memory part1 = string(abi.encodePacked(_svgHeader(), _defs(), _background()));
        string memory part2 = _animatedBorderDual(domain, "STOLEN WALLET");
        string memory part3 = _walletContentMultilang(wallet, tokenId, domain, langCodes, subtitles);

        return string(abi.encodePacked(part1, part2, part3, _svgFooter()));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPPORT SOULBOUND SVG (MULTILINGUAL)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Render SVG for SupportSoulbound token with ALL languages
    /// @dev Uses SVG <switch> with systemLanguage to auto-select user's language
    /// @param supporter The supporter address
    /// @param tokenId The token ID
    /// @param donation The donation amount in wei
    /// @param domain The domain to display (e.g., "stolenwallet.xyz")
    /// @param langCodes Array of ISO 639-1 language codes
    /// @param supportSubtitles Array of support subtitle translations (parallel to langCodes)
    function renderSupportSoulbound(
        address supporter,
        uint256 tokenId,
        uint256 donation,
        string memory domain,
        string[] memory langCodes,
        string[] memory supportSubtitles
    ) internal pure returns (string memory) {
        string memory donationStr = _formatEther(donation);

        // Build in two parts to avoid stack too deep
        string memory part1 = string(abi.encodePacked(_svgHeader(), _defs(), _background()));

        string memory part2 = string(
            abi.encodePacked(
                _animatedBorderDual(domain, "THANK YOU"),
                _supportContentMultilang(supporter, tokenId, donationStr, domain, langCodes, supportSubtitles)
            )
        );

        return string(abi.encodePacked(part1, part2, _svgFooter()));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SVG COMPONENTS
    // ═══════════════════════════════════════════════════════════════════════════

    function _svgHeader() private pure returns (string memory) {
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 400\">";
    }

    function _svgFooter() private pure returns (string memory) {
        return "</svg>";
    }

    /// @dev Defines a single rectangular border path for text to follow
    /// @notice Path positioned in the gutter between outer edge (0) and inner rect (20)
    /// @notice Path at y=12 gives 12px from edge and 8px from inner rect
    function _defs() private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<defs>",
                // Rectangular path centered in gutter - starts at top center for smooth animation
                // Path bounds: 12-388 (376px), corners at ±16px from edges for 16px radius arcs
                "<path id=\"borderPath\" d=\"M200 12 H372 A16 16 0 0 1 388 28 V372 A16 16 0 0 1 372 388 H28 A16 16 0 0 1 12 372 V28 A16 16 0 0 1 28 12 H200\"/>",
                "</defs>"
            )
        );
    }

    /// @dev Black background with inner rectangle (both have rounded corners)
    /// @notice Outer rect has white border for visibility on dark backgrounds
    function _background() private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<rect width=\"400\" height=\"400\" rx=\"20\" fill=\"#000\" stroke=\"#fff\" stroke-width=\"1\"/>",
                "<rect x=\"20\" y=\"20\" width=\"360\" height=\"360\" rx=\"20\" ",
                "fill=\"#111\" stroke=\"#333\" stroke-width=\"1\"/>"
            )
        );
    }

    /// @dev Animated text on BOTH sides of the border using single path with 50% offset
    /// @notice Creates seamless continuous loop - two textPaths on same path, opposite sides
    function _animatedBorderDual(string memory text1, string memory text2) private pure returns (string memory) {
        // Text content with separators (NO trailing dash)
        string memory content1 = string(abi.encodePacked(text1, " - ", text1, " - ", text1));
        string memory content2 = string(abi.encodePacked(text2, " - ", text2, " - ", text2));

        return string(
            abi.encodePacked(
                // First text at 0% offset, animates 0% -> 100% (clockwise)
                "<text fill=\"#fff\" font-size=\"10\" font-family=\"monospace\">",
                "<textPath href=\"#borderPath\">",
                "<animate attributeName=\"startOffset\" from=\"0%\" to=\"100%\" dur=\"60s\" repeatCount=\"indefinite\"/>",
                content1,
                "</textPath>",
                "</text>",
                // Second text at 50% offset (opposite side), animates 50% -> 150%
                "<text fill=\"#fff\" font-size=\"10\" font-family=\"monospace\">",
                "<textPath href=\"#borderPath\" startOffset=\"50%\">",
                "<animate attributeName=\"startOffset\" from=\"50%\" to=\"150%\" dur=\"60s\" repeatCount=\"indefinite\"/>",
                content2,
                "</textPath>",
                "</text>"
            )
        );
    }

    /// @dev Wallet content with multilingual subtitle
    /// @notice English "STOLEN WALLET" + "Signed as stolen" ALWAYS displayed (no systemLanguage)
    /// @notice Other language translations shown below via <switch> with systemLanguage
    function _walletContentMultilang(
        address wallet,
        uint256 tokenId,
        string memory domain,
        string[] memory langCodes,
        string[] memory subtitles
    ) private pure returns (string memory) {
        // Full wallet address (no truncation)
        string memory fullAddr = Strings.toHexString(uint160(wallet), 20);

        // English title - ALWAYS shown (no systemLanguage)
        string memory englishTitle = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"110\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"16\" font-family=\"monospace\">STOLEN WALLET</text>"
            )
        );

        // English subtitle - ALWAYS shown (no systemLanguage)
        string memory englishSubtitle = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"135\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"12\" font-family=\"monospace\">Signed as stolen</text>"
            )
        );

        // Build the <switch> element for non-English language translations only
        string memory switchElement = _buildLanguageSwitch(langCodes, subtitles);

        // Wallet address - full display, white text, larger font
        string memory addressLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"200\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"11\" font-family=\"monospace\">",
                fullAddr,
                "</text>"
            )
        );

        // Token ID - white text
        string memory tokenLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"240\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"12\" font-family=\"monospace\">WALLET #",
                tokenId.toString(),
                "</text>"
            )
        );

        // Domain - white text at y=320
        string memory domainLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"320\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"11\" font-family=\"monospace\">",
                domain,
                "</text>"
            )
        );

        // Footer - white text
        string memory footerLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"360\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"10\" font-family=\"monospace\">Stolen Wallet Registry</text>"
            )
        );

        return string(
            abi.encodePacked(
                englishTitle, englishSubtitle, switchElement, addressLine, tokenLine, domainLine, footerLine
            )
        );
    }

    /// @dev Build SVG <switch> element with systemLanguage for each translation
    /// @notice Shows translation below English title ONLY for non-English browsers
    /// @notice English browsers see nothing here (empty fallback)
    function _buildLanguageSwitch(string[] memory langCodes, string[] memory subtitles)
        private
        pure
        returns (string memory)
    {
        if (langCodes.length == 0) {
            return "";
        }

        // Ensure parallel arrays have matching lengths
        require(langCodes.length == subtitles.length, "Array length mismatch");

        // Start switch element
        string memory result = "<switch>";

        // Add each non-English language with systemLanguage attribute
        for (uint256 i = 0; i < langCodes.length; i++) {
            // Skip English - English title is always shown above, no need for translation
            if (keccak256(bytes(langCodes[i])) == keccak256(bytes("en"))) {
                continue;
            }

            // Position at y=160 (below English subtitle at y=135)
            result = string(
                abi.encodePacked(
                    result,
                    "<text x=\"200\" y=\"160\" text-anchor=\"middle\" fill=\"#fff\" ",
                    "font-size=\"14\" font-family=\"monospace\" systemLanguage=\"",
                    langCodes[i],
                    "\">",
                    subtitles[i],
                    "</text>"
                )
            );
        }

        // Empty fallback for English browsers (they just see the English title above)
        result = string(abi.encodePacked(result, "<g></g>"));

        // Close switch
        result = string(abi.encodePacked(result, "</switch>"));

        return result;
    }

    /// @dev Support content with multilingual subtitle
    /// @notice English "SUPPORTER" + "Registry Supporter" ALWAYS displayed (no systemLanguage)
    /// @notice Other language translations shown below via <switch> with systemLanguage
    function _supportContentMultilang(
        address supporter,
        uint256 tokenId,
        string memory donation,
        string memory domain,
        string[] memory langCodes,
        string[] memory supportSubtitles
    ) private pure returns (string memory) {
        // Full address (no truncation), white text
        string memory fullAddr = Strings.toHexString(uint160(supporter), 20);

        // English title - ALWAYS shown
        string memory title = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"110\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"16\" font-family=\"monospace\">SUPPORTER</text>"
            )
        );

        // English subtitle - ALWAYS shown
        string memory subtitle = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"135\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"12\" font-family=\"monospace\">Registry Supporter</text>"
            )
        );

        // Build the <switch> element for non-English language translations
        string memory switchElement = _buildSupportLanguageSwitch(langCodes, supportSubtitles);

        // Donation amount
        string memory donationLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"200\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"24\" font-family=\"monospace\">",
                donation,
                "</text>"
            )
        );

        // Address - larger font (11px)
        string memory addressLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"250\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"11\" font-family=\"monospace\">",
                fullAddr,
                "</text>"
            )
        );

        // Token ID
        string memory tokenLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"280\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"12\" font-family=\"monospace\">TOKEN #",
                tokenId.toString(),
                "</text>"
            )
        );

        // Domain - white text at y=320
        string memory domainLine = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"320\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"11\" font-family=\"monospace\">",
                domain,
                "</text>"
            )
        );

        // Footer - white text
        string memory footer = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"360\" text-anchor=\"middle\" fill=\"#fff\" ",
                "font-size=\"10\" font-family=\"monospace\">Stolen Wallet Registry</text>"
            )
        );

        return string(
            abi.encodePacked(title, subtitle, switchElement, donationLine, addressLine, tokenLine, domainLine, footer)
        );
    }

    /// @dev Build SVG <switch> element for support soulbound translations
    /// @notice Shows translation below English subtitle ONLY for non-English browsers
    function _buildSupportLanguageSwitch(string[] memory langCodes, string[] memory supportSubtitles)
        private
        pure
        returns (string memory)
    {
        if (langCodes.length == 0) {
            return "";
        }

        // Ensure parallel arrays have matching lengths
        require(langCodes.length == supportSubtitles.length, "Array length mismatch");

        // Start switch element
        string memory result = "<switch>";

        // Add each non-English language with systemLanguage attribute
        for (uint256 i = 0; i < langCodes.length; i++) {
            // Skip English - English subtitle is always shown above, no need for translation
            if (keccak256(bytes(langCodes[i])) == keccak256(bytes("en"))) {
                continue;
            }

            // Position at y=160 (below English subtitle at y=135)
            result = string(
                abi.encodePacked(
                    result,
                    "<text x=\"200\" y=\"160\" text-anchor=\"middle\" fill=\"#fff\" ",
                    "font-size=\"14\" font-family=\"monospace\" systemLanguage=\"",
                    langCodes[i],
                    "\">",
                    supportSubtitles[i],
                    "</text>"
                )
            );
        }

        // Empty fallback for English browsers (they just see the English subtitle above)
        result = string(abi.encodePacked(result, "<g></g>"));

        // Close switch
        result = string(abi.encodePacked(result, "</switch>"));

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Format wei to ETH string with up to 4 decimal places
    /// @notice Preserves leading zeros (e.g., 0.05 ETH displays correctly, not 0.5)
    function _formatEther(uint256 weiAmount) private pure returns (string memory) {
        uint256 eth = weiAmount / 1e18;
        uint256 remainder = weiAmount % 1e18;

        if (remainder == 0) {
            return string(abi.encodePacked(eth.toString(), " ETH"));
        }

        // Get up to 4 decimal places (1e14 = 0.0001 ETH precision)
        uint256 decimals = remainder / 1e14;

        if (decimals == 0) {
            return string(abi.encodePacked(eth.toString(), " ETH"));
        }

        // Build 4-digit decimal string with leading zeros preserved
        bytes memory decimalBytes = new bytes(4);
        uint256 temp = decimals;
        for (uint256 i = 4; i > 0; i--) {
            decimalBytes[i - 1] = bytes1(uint8(48 + (temp % 10)));
            temp /= 10;
        }

        // Find position of last non-zero digit (strip trailing zeros only)
        uint256 endPos = 4;
        while (endPos > 0 && decimalBytes[endPos - 1] == "0") {
            endPos--;
        }

        // Create trimmed decimal string
        bytes memory trimmed = new bytes(endPos);
        for (uint256 i = 0; i < endPos; i++) {
            trimmed[i] = decimalBytes[i];
        }

        return string(abi.encodePacked(eth.toString(), ".", string(trimmed), " ETH"));
    }
}
