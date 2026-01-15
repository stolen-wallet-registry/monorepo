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
/// - On-chain SVG artwork with multilingual support (auto-selects based on browser)
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

    /// @dev Reverse mapping for O(1) token lookup by wallet
    mapping(address wallet => uint256 tokenId) private _walletToTokenId;

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
    event WalletSoulboundMinted(uint256 indexed tokenId, address indexed wallet, address indexed minter);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @param _registry Address of the StolenWalletRegistry contract
    /// @param _translations Address of the TranslationRegistry contract
    /// @param _feeCollector Address to receive fees
    /// @param _domain Domain to display in SVG (e.g., "stolenwallet.xyz")
    constructor(address _registry, address _translations, address _feeCollector, string memory _domain)
        BaseSoulbound("SWR Wallet Soulbound", "SWRW", _translations, _feeCollector, _domain)
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
    ///      SVG auto-selects language based on viewer's browser settings.
    /// @param wallet The wallet address to mint for (must be registered or pending)
    function mintTo(address wallet) external payable {
        // Check wallet is in registry (registered or pending acknowledgement)
        if (!registry.isRegistered(wallet) && !registry.isPending(wallet)) {
            revert NotRegisteredOrPending();
        }

        // Enforce one per wallet
        if (hasMinted[wallet]) {
            revert AlreadyMinted();
        }

        // Mark as minted before mint to prevent reentrancy
        hasMinted[wallet] = true;

        // Mint token to the wallet (not msg.sender!)
        uint256 tokenId = _mintAndLock(wallet);

        // Store metadata
        tokenWallet[tokenId] = wallet;
        _walletToTokenId[wallet] = tokenId;

        emit WalletSoulboundMinted(tokenId, wallet, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN URI (ON-CHAIN SVG)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Generate on-chain SVG metadata with multilingual support
    /// @dev SVG uses <switch> with systemLanguage for auto language selection
    /// @param tokenId The token to get URI for
    /// @return Base64 encoded JSON metadata with embedded SVG
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        address wallet = tokenWallet[tokenId];

        // Get ALL language subtitles for the multilingual SVG
        (string[] memory langCodes, string[] memory subtitles) = translations.getAllSubtitles();

        // Render SVG with domain and all languages embedded
        string memory svg = SVGRenderer.renderWalletSoulbound(wallet, tokenId, domain, langCodes, subtitles);

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
            return (false, "This wallet is not registered");
        }
        return (true, "");
    }

    /// @notice Get token ID for a wallet (O(1) lookup, returns 0 if not minted)
    /// @param wallet The wallet to look up
    /// @return tokenId The token ID, or 0 if not minted
    function getTokenIdForWallet(address wallet) external view returns (uint256 tokenId) {
        return _walletToTokenId[wallet];
    }
}
