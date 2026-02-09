// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { WalletSoulbound } from "../../src/soulbound/WalletSoulbound.sol";
import { BaseSoulbound } from "../../src/soulbound/BaseSoulbound.sol";
import { TranslationRegistry } from "../../src/soulbound/TranslationRegistry.sol";
import { IERC5192 } from "../../src/soulbound/interfaces/IERC5192.sol";
import { SVGRenderer } from "../../src/soulbound/libraries/SVGRenderer.sol";

/// @notice Mock registry for testing WalletSoulbound
/// @dev Implements the IWalletRegistry view methods that WalletSoulbound calls
contract MockStolenWalletRegistry {
    mapping(address => bool) public registered;
    mapping(address => bool) public pending;

    function setRegistered(address wallet, bool value) external {
        registered[wallet] = value;
    }

    function setPending(address wallet, bool value) external {
        pending[wallet] = value;
    }

    function isWalletRegistered(address wallet) external view returns (bool) {
        return registered[wallet];
    }

    function isWalletPending(address wallet) external view returns (bool) {
        return pending[wallet];
    }
}

/// @title WalletSoulbound Tests
/// @notice Tests for registry-gated soulbound tokens (1 per registered wallet)
contract WalletSoulboundTest is Test {
    WalletSoulbound public soulbound;
    TranslationRegistry public translations;
    MockStolenWalletRegistry public mockRegistry;

    address public owner;
    address public feeCollector;
    address public registeredWallet;
    address public pendingWallet;
    address public unregisteredWallet;
    address public minter;

    function setUp() public {
        owner = address(this);
        feeCollector = makeAddr("feeCollector");
        registeredWallet = makeAddr("registeredWallet");
        pendingWallet = makeAddr("pendingWallet");
        unregisteredWallet = makeAddr("unregisteredWallet");
        minter = makeAddr("minter");

        // Deploy dependencies
        translations = new TranslationRegistry(address(this));
        // Add Spanish for multilingual testing
        translations.addLanguage(
            "es", "CARTERA ROBADA", "Firmado como robado", "Gracias por tu apoyo", "No envie fondos", "Registro"
        );
        mockRegistry = new MockStolenWalletRegistry();

        // Setup mock registry state
        mockRegistry.setRegistered(registeredWallet, true);
        mockRegistry.setPending(pendingWallet, true);

        // Deploy soulbound contract
        soulbound = new WalletSoulbound(
            address(mockRegistry), address(translations), feeCollector, "stolenwallet.xyz", address(this)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_constructor_setsRegistry() public view {
        assertEq(address(soulbound.registry()), address(mockRegistry));
    }

    function test_constructor_setsTranslations() public view {
        assertEq(address(soulbound.translations()), address(translations));
    }

    function test_constructor_setsFeeCollector() public view {
        assertEq(soulbound.feeCollector(), feeCollector);
    }

    function test_constructor_revert_zeroRegistry() public {
        vm.expectRevert(WalletSoulbound.InvalidRegistry.selector);
        new WalletSoulbound(address(0), address(translations), feeCollector, "stolenwallet.xyz", address(this));
    }

    /// @notice Constructor reverts with zero translations address
    function test_constructor_revert_zeroTranslations() public {
        vm.expectRevert(BaseSoulbound.InvalidTranslations.selector);
        new WalletSoulbound(address(mockRegistry), address(0), feeCollector, "stolenwallet.xyz", address(this));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINT TO TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Can mint to a registered wallet
    function test_mintTo_success_registered() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        assertEq(soulbound.balanceOf(registeredWallet), 1);
        assertEq(soulbound.ownerOf(1), registeredWallet);
        assertTrue(soulbound.hasMinted(registeredWallet));
    }

    /// @notice Can mint to a pending wallet (during grace period)
    function test_mintTo_success_pending() public {
        vm.prank(minter);
        soulbound.mintTo(pendingWallet);

        assertEq(soulbound.balanceOf(pendingWallet), 1);
        assertEq(soulbound.ownerOf(1), pendingWallet);
    }

    /// @notice Token is minted to wallet, not to msg.sender
    function test_mintTo_tokenGoesToWallet_notMinter() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        // Token goes to registered wallet, not minter
        assertEq(soulbound.balanceOf(registeredWallet), 1);
        assertEq(soulbound.balanceOf(minter), 0);
    }

    /// @notice Mint emits correct event
    function test_mintTo_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit WalletSoulbound.WalletSoulboundMinted(1, registeredWallet, minter);

        vm.prank(minter);
        soulbound.mintTo(registeredWallet);
    }

    /// @notice Cannot mint to unregistered wallet
    function test_mintTo_revert_notRegistered() public {
        vm.prank(minter);
        vm.expectRevert(WalletSoulbound.NotRegisteredOrPending.selector);
        soulbound.mintTo(unregisteredWallet);
    }

    /// @notice Cannot mint twice to same wallet
    function test_mintTo_revert_alreadyMinted() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        vm.prank(minter);
        vm.expectRevert(WalletSoulbound.AlreadyMinted.selector);
        soulbound.mintTo(registeredWallet);
    }

    /// @notice Stores correct token metadata
    function test_mintTo_storesMetadata() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        assertEq(soulbound.tokenWallet(1), registeredWallet);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-5192 SOULBOUND TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice locked() returns true for minted tokens
    function test_locked_returnsTrue() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        assertTrue(soulbound.locked(1));
    }

    /// @notice locked() reverts for non-existent tokens
    function test_locked_revert_nonExistent() public {
        vm.expectRevert(); // ERC721NonexistentToken
        soulbound.locked(999);
    }

    /// @notice Emits Locked event on mint
    /// @dev Locked(uint256 tokenId) has no indexed params, so tokenId is in data
    function test_mintTo_emitsLocked() public {
        vm.expectEmit(false, false, false, true);
        emit IERC5192.Locked(1);

        vm.prank(minter);
        soulbound.mintTo(registeredWallet);
    }

    /// @notice Contract reports ERC-5192 interface support
    function test_supportsInterface_ERC5192() public view {
        assertTrue(soulbound.supportsInterface(type(IERC5192).interfaceId));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSFER BLOCKING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice transferFrom reverts (via _update override)
    function test_transfer_revert() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        vm.prank(registeredWallet);
        vm.expectRevert(BaseSoulbound.NonTransferrable.selector);
        soulbound.transferFrom(registeredWallet, minter, 1);
    }

    /// @notice safeTransferFrom reverts (via _update override)
    function test_safeTransfer_revert() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        vm.prank(registeredWallet);
        vm.expectRevert(BaseSoulbound.NonTransferrable.selector);
        soulbound.safeTransferFrom(registeredWallet, minter, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN URI TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice tokenURI returns valid JSON data URI
    function test_tokenURI_returnsValidDataURI() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        string memory uri = soulbound.tokenURI(1);

        // Should start with data:application/json;base64,
        assertTrue(bytes(uri).length > 35);
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    /// @notice tokenURI reverts for non-existent token
    function test_tokenURI_revert_nonExistent() public {
        vm.expectRevert(); // ERC721NonexistentToken
        soulbound.tokenURI(999);
    }

    /// @notice SVG contains multilingual switch elements with systemLanguage
    /// @dev Tests SVGRenderer directly to verify translations are embedded for browser language selection
    function test_svgRenderer_containsMultilingualSwitch() public view {
        // Get translations from registry (same as tokenURI would)
        (string[] memory langCodes, string[] memory subtitles) = translations.getAllSubtitles();

        // Render SVG directly using the library
        string memory svg =
            SVGRenderer.renderWalletSoulbound(registeredWallet, 1, "stolenwallet.xyz", langCodes, subtitles);

        // The SVG must contain <switch> elements for language selection
        assertTrue(_contains(svg, "<switch>"), "SVG should contain <switch> element");

        // The SVG must contain systemLanguage attributes for non-English languages
        assertTrue(_contains(svg, "systemLanguage"), "SVG should contain systemLanguage attribute");

        // The SVG must contain the Spanish translation (proves non-English languages are included)
        assertTrue(_contains(svg, "Firmado como robado"), "SVG should contain Spanish subtitle");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice canMint returns correct eligibility
    function test_canMint_eligible() public view {
        (bool eligible, string memory reason) = soulbound.canMint(registeredWallet);
        assertTrue(eligible);
        assertEq(reason, "");
    }

    /// @notice canMint returns false if already minted
    function test_canMint_alreadyMinted() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        (bool eligible, string memory reason) = soulbound.canMint(registeredWallet);
        assertFalse(eligible);
        assertEq(reason, "Already minted");
    }

    /// @notice canMint returns false if not registered
    function test_canMint_notRegistered() public view {
        (bool eligible, string memory reason) = soulbound.canMint(unregisteredWallet);
        assertFalse(eligible);
        assertEq(reason, "This wallet is not registered");
    }

    /// @notice getTokenIdForWallet returns correct token ID
    function test_getTokenIdForWallet_success() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet);

        assertEq(soulbound.getTokenIdForWallet(registeredWallet), 1);
    }

    /// @notice getTokenIdForWallet returns 0 for unminted wallet
    function test_getTokenIdForWallet_notMinted() public view {
        assertEq(soulbound.getTokenIdForWallet(registeredWallet), 0);
    }

    /// @notice totalSupply increments correctly
    function test_totalSupply() public {
        assertEq(soulbound.totalSupply(), 0);

        vm.prank(minter);
        soulbound.mintTo(registeredWallet);
        assertEq(soulbound.totalSupply(), 1);

        vm.prank(minter);
        soulbound.mintTo(pendingWallet);
        assertEq(soulbound.totalSupply(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE WITHDRAWAL TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw sends balance to feeCollector
    function test_withdraw_success() public {
        // Send some ETH to contract
        vm.deal(address(soulbound), 1 ether);

        uint256 balanceBefore = feeCollector.balance;
        soulbound.withdraw();
        uint256 balanceAfter = feeCollector.balance;

        assertEq(balanceAfter - balanceBefore, 1 ether);
        assertEq(address(soulbound).balance, 0);
    }

    /// @notice Only owner can withdraw
    function test_withdraw_revert_notOwner() public {
        vm.deal(address(soulbound), 1 ether);
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, minter));
        soulbound.withdraw();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory prefixBytes = bytes(prefix);

        if (strBytes.length < prefixBytes.length) return false;

        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (strBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    function _contains(string memory str, string memory substr) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory subBytes = bytes(substr);

        if (subBytes.length > strBytes.length) return false;
        if (subBytes.length == 0) return true;

        for (uint256 i = 0; i <= strBytes.length - subBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < subBytes.length; j++) {
                if (strBytes[i + j] != subBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }
}
