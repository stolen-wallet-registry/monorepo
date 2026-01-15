// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SupportSoulbound } from "../../src/soulbound/SupportSoulbound.sol";
import { BaseSoulbound } from "../../src/soulbound/BaseSoulbound.sol";
import { TranslationRegistry } from "../../src/soulbound/TranslationRegistry.sol";
import { IERC5192 } from "../../src/soulbound/interfaces/IERC5192.sol";

/// @title SupportSoulbound Tests
/// @notice Tests for donation-based soulbound tokens (unlimited per wallet)
contract SupportSoulboundTest is Test {
    SupportSoulbound public soulbound;
    TranslationRegistry public translations;

    address public owner;
    address public feeCollector;
    address public supporter1;
    address public supporter2;

    uint256 public constant MIN_WEI = 0.0001 ether;

    function setUp() public {
        owner = address(this);
        feeCollector = makeAddr("feeCollector");
        supporter1 = makeAddr("supporter1");
        supporter2 = makeAddr("supporter2");

        // Fund supporters
        vm.deal(supporter1, 10 ether);
        vm.deal(supporter2, 10 ether);

        // Deploy dependencies
        translations = new TranslationRegistry();

        // Deploy soulbound contract
        soulbound = new SupportSoulbound(MIN_WEI, address(translations), feeCollector);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_constructor_setsMinWei() public view {
        assertEq(soulbound.minWei(), MIN_WEI);
    }

    function test_constructor_setsTranslations() public view {
        assertEq(address(soulbound.translations()), address(translations));
    }

    function test_constructor_setsFeeCollector() public view {
        assertEq(soulbound.feeCollector(), feeCollector);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MINT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Can mint with minimum amount
    function test_mint_success_minimum() public {
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en");

        assertEq(soulbound.balanceOf(supporter1), 1);
        assertEq(soulbound.ownerOf(1), supporter1);
    }

    /// @notice Can mint with large donation
    function test_mint_success_largeDonation() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }("en");

        assertEq(soulbound.tokenDonation(1), 1 ether);
    }

    /// @notice Stores donation amount correctly
    function test_mint_storesDonation() public {
        uint256 donation = 0.05 ether;
        vm.prank(supporter1);
        soulbound.mint{ value: donation }("en");

        assertEq(soulbound.tokenDonation(1), donation);
    }

    /// @notice Stores language correctly
    function test_mint_storesLanguage() public {
        translations.addLanguage("es", "ES", "es", "es", "es");

        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("es");

        assertEq(soulbound.tokenLanguage(1), "es");
    }

    /// @notice Unsupported language falls back to English
    function test_mint_fallbackLanguage() public {
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("zz");

        assertEq(soulbound.tokenLanguage(1), "en");
    }

    /// @notice Mint emits correct event
    function test_mint_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit SupportSoulbound.SupportSoulboundMinted(1, supporter1, 0.01 ether, "en");

        vm.prank(supporter1);
        soulbound.mint{ value: 0.01 ether }("en");
    }

    /// @notice Cannot mint below minimum
    function test_mint_revert_belowMinimum() public {
        vm.prank(supporter1);
        vm.expectRevert(SupportSoulbound.BelowMinimum.selector);
        soulbound.mint{ value: MIN_WEI - 1 }("en");
    }

    /// @notice Same wallet can mint multiple times (unlimited)
    function test_mint_multipleTimes() public {
        vm.startPrank(supporter1);

        soulbound.mint{ value: MIN_WEI }("en");
        assertEq(soulbound.balanceOf(supporter1), 1);

        soulbound.mint{ value: MIN_WEI }("en");
        assertEq(soulbound.balanceOf(supporter1), 2);

        soulbound.mint{ value: MIN_WEI }("en");
        assertEq(soulbound.balanceOf(supporter1), 3);

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SET MIN WEI TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can update minimum
    function test_setMinWei_success() public {
        uint256 newMin = 0.001 ether;
        soulbound.setMinWei(newMin);

        assertEq(soulbound.minWei(), newMin);
    }

    /// @notice setMinWei emits event
    function test_setMinWei_emitsEvent() public {
        uint256 newMin = 0.001 ether;

        vm.expectEmit(true, true, false, false);
        emit SupportSoulbound.MinWeiUpdated(MIN_WEI, newMin);

        soulbound.setMinWei(newMin);
    }

    /// @notice Non-owner cannot update minimum
    function test_setMinWei_revert_notOwner() public {
        vm.prank(supporter1);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        soulbound.setMinWei(0.001 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-5192 SOULBOUND TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice locked() returns true for minted tokens
    function test_locked_returnsTrue() public {
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en");

        assertTrue(soulbound.locked(1));
    }

    /// @notice Emits Locked event on mint
    function test_mint_emitsLocked() public {
        vm.expectEmit(true, false, false, false);
        emit IERC5192.Locked(1);

        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en");
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
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en");

        vm.prank(supporter1);
        vm.expectRevert(BaseSoulbound.NonTransferrable.selector);
        soulbound.transferFrom(supporter1, supporter2, 1);
    }

    /// @notice safeTransferFrom reverts (via _update override)
    function test_safeTransfer_revert() public {
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en");

        vm.prank(supporter1);
        vm.expectRevert(BaseSoulbound.NonTransferrable.selector);
        soulbound.safeTransferFrom(supporter1, supporter2, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TOKEN URI TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice tokenURI returns valid JSON data URI
    function test_tokenURI_returnsValidDataURI() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 0.025 ether }("en");

        string memory uri = soulbound.tokenURI(1);

        // Should start with data:application/json;base64,
        assertTrue(bytes(uri).length > 35);
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    /// @notice tokenURI shows donation amount
    function test_tokenURI_showsDonationAmount() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }("en");

        // URI contains base64-encoded JSON with donation info
        // We just verify it returns without error for large donations
        string memory uri = soulbound.tokenURI(1);
        assertTrue(bytes(uri).length > 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice totalDonations returns sum of all donations
    function test_totalDonations() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 0.5 ether }("en");

        vm.prank(supporter2);
        soulbound.mint{ value: 0.3 ether }("en");

        vm.prank(supporter1);
        soulbound.mint{ value: 0.2 ether }("en");

        assertEq(soulbound.totalDonations(), 1 ether);
    }

    /// @notice getTokensForSupporter returns correct token IDs
    function test_getTokensForSupporter() public {
        vm.startPrank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en"); // Token 1
        soulbound.mint{ value: MIN_WEI }("en"); // Token 2
        soulbound.mint{ value: MIN_WEI }("en"); // Token 3
        vm.stopPrank();

        vm.prank(supporter2);
        soulbound.mint{ value: MIN_WEI }("en"); // Token 4

        uint256[] memory tokens1 = soulbound.getTokensForSupporter(supporter1);
        uint256[] memory tokens2 = soulbound.getTokensForSupporter(supporter2);

        assertEq(tokens1.length, 3);
        assertEq(tokens1[0], 1);
        assertEq(tokens1[1], 2);
        assertEq(tokens1[2], 3);

        assertEq(tokens2.length, 1);
        assertEq(tokens2[0], 4);
    }

    /// @notice getTokensForSupporter returns empty for non-supporters
    function test_getTokensForSupporter_empty() public view {
        uint256[] memory tokens = soulbound.getTokensForSupporter(supporter1);
        assertEq(tokens.length, 0);
    }

    /// @notice totalSupply increments correctly
    function test_totalSupply() public {
        assertEq(soulbound.totalSupply(), 0);

        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }("en");
        assertEq(soulbound.totalSupply(), 1);

        vm.prank(supporter2);
        soulbound.mint{ value: MIN_WEI }("en");
        assertEq(soulbound.totalSupply(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE WITHDRAWAL TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw sends balance to feeCollector
    function test_withdraw_success() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }("en");

        vm.prank(supporter2);
        soulbound.mint{ value: 0.5 ether }("en");

        uint256 balanceBefore = feeCollector.balance;
        soulbound.withdraw();
        uint256 balanceAfter = feeCollector.balance;

        assertEq(balanceAfter - balanceBefore, 1.5 ether);
        assertEq(address(soulbound).balance, 0);
    }

    /// @notice Only owner can withdraw
    function test_withdraw_revert_notOwner() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }("en");

        vm.prank(supporter1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, supporter1));
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
}
