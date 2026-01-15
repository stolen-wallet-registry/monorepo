// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title SVGRenderer
/// @notice Generates on-chain SVG artwork for soulbound tokens
/// @dev Uniswap-style animated SVG with rotating text path
/// @author Stolen Wallet Registry Team
library SVGRenderer {
    using Strings for uint256;
    using Strings for address;

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET SOULBOUND SVG
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Render SVG for WalletSoulbound token
    function renderWalletSoulbound(
        address wallet,
        uint256 tokenId,
        string memory title,
        string memory subtitle,
        string memory warning,
        string memory footer
    ) internal pure returns (string memory) {
        // Build in two parts to avoid stack too deep
        string memory part1 = string(abi.encodePacked(_svgHeader(), _defs(), _backgroundWallet()));

        string memory part2 = string(
            abi.encodePacked(_animatedBorder(title, warning), _walletContent(wallet, tokenId, subtitle, footer))
        );

        return string(abi.encodePacked(part1, part2, _svgFooter()));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPPORT SOULBOUND SVG
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Render SVG for SupportSoulbound token
    function renderSupportSoulbound(
        address supporter,
        uint256 tokenId,
        uint256 donation,
        string memory title,
        string memory footer
    ) internal pure returns (string memory) {
        string memory donationStr = _formatEther(donation);

        // Build in two parts to avoid stack too deep
        string memory part1 = string(abi.encodePacked(_svgHeader(), _defs(), _backgroundSupport()));

        string memory part2 = string(
            abi.encodePacked(_animatedBorderSimple(title), _supportContent(supporter, tokenId, donationStr, footer))
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

    function _defs() private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<defs>",
                "<path id=\"textCircle\" d=\"M 200,200 m -150,0 a 150,150 0 1,1 300,0 a 150,150 0 1,1 -300,0\"/>",
                _gradient(),
                "</defs>"
            )
        );
    }

    function _gradient() private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<linearGradient id=\"grad1\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">",
                "<stop offset=\"0%\" style=\"stop-color:#ff6b6b\"/>",
                "<stop offset=\"100%\" style=\"stop-color:#feca57\"/>",
                "</linearGradient>"
            )
        );
    }

    function _backgroundWallet() private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<rect width=\"400\" height=\"400\" fill=\"#1a1a2e\"/>",
                "<rect x=\"20\" y=\"20\" width=\"360\" height=\"360\" rx=\"20\" ",
                "fill=\"#16213e\" stroke=\"url(#grad1)\" stroke-width=\"2\"/>"
            )
        );
    }

    function _backgroundSupport() private pure returns (string memory) {
        return string(
            abi.encodePacked(
                "<rect width=\"400\" height=\"400\" fill=\"#0d1b2a\"/>",
                "<rect x=\"20\" y=\"20\" width=\"360\" height=\"360\" rx=\"20\" ",
                "fill=\"#1b263b\" stroke=\"url(#grad1)\" stroke-width=\"2\"/>"
            )
        );
    }

    /// @dev Animated rotating text around the border for wallet tokens
    function _animatedBorder(string memory text1, string memory text2) private pure returns (string memory) {
        // Split into smaller parts to avoid stack issues
        string memory textStart = string(
            abi.encodePacked(
                "<text fill=\"#ff6b6b\" font-size=\"12\" font-family=\"monospace\">",
                "<textPath href=\"#textCircle\">",
                "<animate attributeName=\"startOffset\" from=\"0%\" to=\"100%\" ",
                "dur=\"20s\" repeatCount=\"indefinite\"/>"
            )
        );

        string memory content = string(
            abi.encodePacked(text1, unicode" • ", text2, unicode" • ", text1, unicode" • ", text2, unicode" • ")
        );

        return string(abi.encodePacked(textStart, content, "</textPath></text>"));
    }

    /// @dev Simplified border for support tokens
    function _animatedBorderSimple(string memory title) private pure returns (string memory) {
        string memory textStart = string(
            abi.encodePacked(
                "<text fill=\"#ff6b6b\" font-size=\"12\" font-family=\"monospace\">",
                "<textPath href=\"#textCircle\">",
                "<animate attributeName=\"startOffset\" from=\"0%\" to=\"100%\" ",
                "dur=\"20s\" repeatCount=\"indefinite\"/>"
            )
        );

        string memory content =
            string(abi.encodePacked(title, unicode" • THANK YOU • ", title, unicode" • THANK YOU • "));

        return string(abi.encodePacked(textStart, content, "</textPath></text>"));
    }

    function _walletContent(address wallet, uint256 tokenId, string memory subtitle, string memory footer)
        private
        pure
        returns (string memory)
    {
        string memory truncatedAddr = _truncateAddress(wallet);

        // Split into parts
        string memory line1 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"160\" text-anchor=\"middle\" fill=\"white\" ",
                "font-size=\"14\" font-family=\"monospace\">",
                subtitle,
                "</text>"
            )
        );

        string memory line2 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"200\" text-anchor=\"middle\" fill=\"url(#grad1)\" ",
                "font-size=\"10\" font-family=\"monospace\">",
                truncatedAddr,
                "</text>"
            )
        );

        string memory line3 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"240\" text-anchor=\"middle\" fill=\"#888\" ",
                "font-size=\"12\" font-family=\"monospace\">WALLET #",
                tokenId.toString(),
                "</text>"
            )
        );

        string memory line4 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"360\" text-anchor=\"middle\" fill=\"#666\" ",
                "font-size=\"10\" font-family=\"monospace\">",
                footer,
                "</text>"
            )
        );

        return string(abi.encodePacked(line1, line2, line3, line4));
    }

    function _supportContent(address supporter, uint256 tokenId, string memory donation, string memory footer)
        private
        pure
        returns (string memory)
    {
        string memory truncatedAddr = _truncateAddress(supporter);

        // Split into parts
        string memory line1 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"150\" text-anchor=\"middle\" fill=\"white\" ",
                "font-size=\"16\" font-family=\"monospace\">SUPPORTER</text>"
            )
        );

        string memory line2 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"200\" text-anchor=\"middle\" fill=\"url(#grad1)\" ",
                "font-size=\"24\" font-family=\"monospace\">",
                donation,
                "</text>"
            )
        );

        string memory line3 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"240\" text-anchor=\"middle\" fill=\"#888\" ",
                "font-size=\"10\" font-family=\"monospace\">",
                truncatedAddr,
                "</text>"
            )
        );

        string memory line4 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"270\" text-anchor=\"middle\" fill=\"#888\" ",
                "font-size=\"12\" font-family=\"monospace\">TOKEN #",
                tokenId.toString(),
                "</text>"
            )
        );

        string memory line5 = string(
            abi.encodePacked(
                "<text x=\"200\" y=\"360\" text-anchor=\"middle\" fill=\"#666\" ",
                "font-size=\"10\" font-family=\"monospace\">",
                footer,
                "</text>"
            )
        );

        return string(abi.encodePacked(line1, line2, line3, line4, line5));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Truncate address to 0x1234...5678 format
    function _truncateAddress(address addr) private pure returns (string memory) {
        string memory full = Strings.toHexString(uint160(addr), 20);
        // full is "0x" + 40 hex chars = 42 chars total
        // Return 0x1234...5678 format (first 6 chars + ... + last 4 chars)
        bytes memory fullBytes = bytes(full);
        bytes memory result = new bytes(13); // "0x1234...5678" = 13 chars

        // Copy first 6 chars (0x1234)
        for (uint256 i = 0; i < 6; i++) {
            result[i] = fullBytes[i];
        }
        // Add "..."
        result[6] = ".";
        result[7] = ".";
        result[8] = ".";
        // Copy last 4 chars (5678)
        for (uint256 i = 0; i < 4; i++) {
            result[9 + i] = fullBytes[38 + i];
        }

        return string(result);
    }

    /// @dev Format wei to ETH string with up to 4 decimal places
    function _formatEther(uint256 weiAmount) private pure returns (string memory) {
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
}
