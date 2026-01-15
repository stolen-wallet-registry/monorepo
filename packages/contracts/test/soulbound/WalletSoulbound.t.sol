// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { WalletSoulbound } from "../../src/soulbound/WalletSoulbound.sol";
import { BaseSoulbound } from "../../src/soulbound/BaseSoulbound.sol";
import { TranslationRegistry } from "../../src/soulbound/TranslationRegistry.sol";
import { IStolenWalletRegistry } from "../../src/interfaces/IStolenWalletRegistry.sol";
import { IERC5192 } from "../../src/soulbound/interfaces/IERC5192.sol";

/// @notice Mock registry for testing WalletSoulbound
contract MockStolenWalletRegistry {
    mapping(address => bool) public registered;
    mapping(address => bool) public pending;

    function setRegistered(address wallet, bool value) external {
        registered[wallet] = value;
    }

    function setPending(address wallet, bool value) external {
        pending[wallet] = value;
    }

    function isRegistered(address wallet) external view returns (bool) {
        return registered[wallet];
    }

    function isPending(address wallet) external view returns (bool) {
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
        translations = new TranslationRegistry();
        mockRegistry = new MockStolenWalletRegistry();

        // Setup mock registry state
        mockRegistry.setRegistered(registeredWallet, true);
        mockRegistry.setPending(pendingWallet, true);

        // Deploy soulbound contract
        soulbound = new WalletSoulbound(address(mockRegistry), address(translations), feeCollector);
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
        new WalletSoulbound(address(0), address(translations), feeCollector);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINT TO TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Can mint to a registered wallet
    function test_mintTo_success_registered() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

        assertEq(soulbound.balanceOf(registeredWallet), 1);
        assertEq(soulbound.ownerOf(1), registeredWallet);
        assertTrue(soulbound.hasMinted(registeredWallet));
    }

    /// @notice Can mint to a pending wallet (during grace period)
    function test_mintTo_success_pending() public {
        vm.prank(minter);
        soulbound.mintTo(pendingWallet, "en");

        assertEq(soulbound.balanceOf(pendingWallet), 1);
        assertEq(soulbound.ownerOf(1), pendingWallet);
    }

    /// @notice Token is minted to wallet, not to msg.sender
    function test_mintTo_tokenGoesToWallet_notMinter() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

        // Token goes to registered wallet, not minter
        assertEq(soulbound.balanceOf(registeredWallet), 1);
        assertEq(soulbound.balanceOf(minter), 0);
    }

    /// @notice Mint emits correct event
    function test_mintTo_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit WalletSoulbound.WalletSoulboundMinted(1, registeredWallet, minter, "en");

        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");
    }

    /// @notice Cannot mint to unregistered wallet
    function test_mintTo_revert_notRegistered() public {
        vm.prank(minter);
        vm.expectRevert(WalletSoulbound.NotRegisteredOrPending.selector);
        soulbound.mintTo(unregisteredWallet, "en");
    }

    /// @notice Cannot mint twice to same wallet
    function test_mintTo_revert_alreadyMinted() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

        vm.prank(minter);
        vm.expectRevert(WalletSoulbound.AlreadyMinted.selector);
        soulbound.mintTo(registeredWallet, "en");
    }

    /// @notice Unsupported language falls back to English
    function test_mintTo_fallbackLanguage() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "zz"); // unsupported language

        // Should store "en" as fallback
        assertEq(soulbound.tokenLanguage(1), "en");
    }

    /// @notice Stores correct token metadata
    function test_mintTo_storesMetadata() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

        assertEq(soulbound.tokenWallet(1), registeredWallet);
        assertEq(soulbound.tokenLanguage(1), "en");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-5192 SOULBOUND TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice locked() returns true for minted tokens
    function test_locked_returnsTrue() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

        assertTrue(soulbound.locked(1));
    }

    /// @notice locked() reverts for non-existent tokens
    function test_locked_revert_nonExistent() public {
        vm.expectRevert(); // ERC721NonexistentToken
        soulbound.locked(999);
    }

    /// @notice Emits Locked event on mint
    function test_mintTo_emitsLocked() public {
        vm.expectEmit(true, false, false, false);
        emit IERC5192.Locked(1);

        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");
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
        soulbound.mintTo(registeredWallet, "en");

        vm.prank(registeredWallet);
        vm.expectRevert(BaseSoulbound.NonTransferrable.selector);
        soulbound.transferFrom(registeredWallet, minter, 1);
    }

    /// @notice safeTransferFrom reverts (via _update override)
    function test_safeTransfer_revert() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

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
        soulbound.mintTo(registeredWallet, "en");

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
        soulbound.mintTo(registeredWallet, "en");

        (bool eligible, string memory reason) = soulbound.canMint(registeredWallet);
        assertFalse(eligible);
        assertEq(reason, "Already minted");
    }

    /// @notice canMint returns false if not registered
    function test_canMint_notRegistered() public view {
        (bool eligible, string memory reason) = soulbound.canMint(unregisteredWallet);
        assertFalse(eligible);
        assertEq(reason, "Not registered");
    }

    /// @notice getTokenIdForWallet returns correct token ID
    function test_getTokenIdForWallet_success() public {
        vm.prank(minter);
        soulbound.mintTo(registeredWallet, "en");

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
        soulbound.mintTo(registeredWallet, "en");
        assertEq(soulbound.totalSupply(), 1);

        vm.prank(minter);
        soulbound.mintTo(pendingWallet, "en");
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
}
