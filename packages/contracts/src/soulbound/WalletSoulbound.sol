// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseSoulbound } from "./BaseSoulbound.sol";
import { IStolenWalletRegistry } from "../interfaces/IStolenWalletRegistry.sol";
import { SVGRenderer } from "./libraries/SVGRenderer.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title WalletSoulbound
/// @notice Soulbound token for registered stolen wallets
/// @dev One per wallet, requires wallet to be registered or pending in StolenWalletRegistry
/// @author Stolen Wallet Registry Team
///
/// Key Features:
/// - 1 token per registered wallet (enforced on-chain)
/// - Gated by StolenWalletRegistry (wallet must be registered or pending)
/// - Anyone can pay for mint, token goes to the registered wallet
/// - On-chain SVG artwork with multilingual support
/// - ERC-5192 compliant (non-transferable)
contract WalletSoulbound is BaseSoulbound {
    using Strings for uint256;
    using Strings for address;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Reference to the Stolen Wallet Registry
    IStolenWalletRegistry public immutable registry;

    /// @dev Tracks which wallet each token represents
    mapping(uint256 tokenId => address wallet) public tokenWallet;

    /// @dev Tracks if a wallet has already minted (1 per wallet enforcement)
    mapping(address wallet => bool) public hasMinted;

    /// @dev Language preference per token (ISO 639-1 code)
    mapping(uint256 tokenId => string) public tokenLanguage;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when wallet is not registered or pending in the registry
    error NotRegisteredOrPending();

    /// @notice Thrown when wallet has already minted its soulbound token
    error AlreadyMinted();

    /// @notice Thrown when registry address is zero
    error InvalidRegistry();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a wallet soulbound token is minted
    /// @param tokenId The minted token ID
    /// @param wallet The wallet the token represents
    /// @param minter Who paid for the mint (may differ from wallet)
    /// @param language The language code for the SVG
    event WalletSoulboundMinted(
        uint256 indexed tokenId, address indexed wallet, address indexed minter, string language
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @param _registry Address of the StolenWalletRegistry contract
    /// @param _translations Address of the TranslationRegistry contract
    /// @param _feeCollector Address to receive fees
    constructor(address _registry, address _translations, address _feeCollector)
        BaseSoulbound("SWR Wallet Soulbound", "SWRW", _translations, _feeCollector)
    {
        if (_registry == address(0)) revert InvalidRegistry();
        registry = IStolenWalletRegistry(_registry);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINT FUNCTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a soulbound token for a registered/pending wallet
    /// @dev Anyone can pay for the mint - the token goes to the wallet.
    ///      This supports the drained wallet scenario where the owner
    ///      can't pay gas but a friend/relayer can help.
    /// @param wallet The wallet address to mint for (must be registered or pending)
    /// @param language ISO 639-1 language code for SVG text (e.g., "en", "es", "zh")
    function mintTo(address wallet, string calldata language) external payable {
        // Check wallet is in registry (registered or pending acknowledgement)
        if (!registry.isRegistered(wallet) && !registry.isPending(wallet)) {
            revert NotRegisteredOrPending();
        }

        // Enforce one per wallet
        if (hasMinted[wallet]) {
            revert AlreadyMinted();
        }

        // Validate language (falls back to "en" if unsupported)
        string memory lang = translations.isLanguageSupported(language) ? language : "en";

        // Mark as minted before mint to prevent reentrancy
        hasMinted[wallet] = true;

        // Mint token to the wallet (not msg.sender!)
        uint256 tokenId = _mintAndLock(wallet);

        // Store metadata
        tokenWallet[tokenId] = wallet;
        tokenLanguage[tokenId] = lang;

        emit WalletSoulboundMinted(tokenId, wallet, msg.sender, lang);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN URI (ON-CHAIN SVG)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Generate on-chain SVG metadata
    /// @param tokenId The token to get URI for
    /// @return Base64 encoded JSON metadata with embedded SVG
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        address wallet = tokenWallet[tokenId];
        string memory language = tokenLanguage[tokenId];

        // Get translations
        (string memory title, string memory subtitle, string memory warning, string memory footer) =
            translations.getLanguage(language);

        // Render SVG
        string memory svg = SVGRenderer.renderWalletSoulbound(wallet, tokenId, title, subtitle, warning, footer);

        // Build JSON metadata
        string memory json = string(
            abi.encodePacked(
                "{\"name\":\"SWR Wallet Soulbound #",
                tokenId.toString(),
                "\",\"description\":\"This wallet has been registered as stolen in the Stolen Wallet Registry.",
                "\",\"image\":\"data:image/svg+xml;base64,",
                Base64.encode(bytes(svg)),
                "\",\"attributes\":[",
                "{\"trait_type\":\"Wallet\",\"value\":\"",
                Strings.toHexString(uint160(wallet), 20),
                "\"},{\"trait_type\":\"Language\",\"value\":\"",
                language,
                "\"},{\"trait_type\":\"Type\",\"value\":\"Wallet Soulbound\"}",
                "]}"
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a wallet is eligible to mint (registered or pending, not already minted)
    /// @param wallet The wallet to check
    /// @return eligible True if wallet can mint
    /// @return reason Description if not eligible
    function canMint(address wallet) external view returns (bool eligible, string memory reason) {
        if (hasMinted[wallet]) {
            return (false, "Already minted");
        }
        if (!registry.isRegistered(wallet) && !registry.isPending(wallet)) {
            return (false, "Not registered");
        }
        return (true, "");
    }

    /// @notice Get token ID for a wallet (returns 0 if not minted)
    /// @param wallet The wallet to look up
    /// @return tokenId The token ID, or 0 if not minted
    function getTokenIdForWallet(address wallet) external view returns (uint256 tokenId) {
        if (!hasMinted[wallet]) return 0;
        // Linear search through tokens - acceptable for lookup utility
        for (uint256 i = 1; i <= _tokenIdCounter; i++) {
            if (tokenWallet[i] == wallet) {
                return i;
            }
        }
        return 0;
    }
}
