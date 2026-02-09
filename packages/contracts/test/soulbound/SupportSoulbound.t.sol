// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SupportSoulbound } from "../../src/soulbound/SupportSoulbound.sol";
import { BaseSoulbound } from "../../src/soulbound/BaseSoulbound.sol";
import { TranslationRegistry } from "../../src/soulbound/TranslationRegistry.sol";
import { IERC5192 } from "../../src/soulbound/interfaces/IERC5192.sol";
import { SVGRenderer } from "../../src/soulbound/libraries/SVGRenderer.sol";

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
        translations = new TranslationRegistry(address(this));
        // Add Spanish for multilingual testing
        translations.addLanguage(
            "es", "CARTERA ROBADA", "Firmado como robado", "Gracias por tu apoyo", "No envie fondos", "Registro"
        );

        // Deploy soulbound contract
        soulbound =
            new SupportSoulbound(MIN_WEI, address(translations), feeCollector, "stolenwallet.xyz", address(this));
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
        soulbound.mint{ value: MIN_WEI }();

        assertEq(soulbound.balanceOf(supporter1), 1);
        assertEq(soulbound.ownerOf(1), supporter1);
    }

    /// @notice Can mint with large donation
    function test_mint_success_largeDonation() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }();

        assertEq(soulbound.tokenDonation(1), 1 ether);
    }

    /// @notice Stores donation amount correctly
    function test_mint_storesDonation() public {
        uint256 donation = 0.05 ether;
        vm.prank(supporter1);
        soulbound.mint{ value: donation }();

        assertEq(soulbound.tokenDonation(1), donation);
    }

    /// @notice Mint emits correct event
    function test_mint_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit SupportSoulbound.SupportSoulboundMinted(1, supporter1, 0.01 ether);

        vm.prank(supporter1);
        soulbound.mint{ value: 0.01 ether }();
    }

    /// @notice Cannot mint below minimum
    function test_mint_revert_belowMinimum() public {
        vm.prank(supporter1);
        vm.expectRevert(SupportSoulbound.BelowMinimum.selector);
        soulbound.mint{ value: MIN_WEI - 1 }();
    }

    /// @notice Same wallet can mint multiple times (unlimited)
    function test_mint_multipleTimes() public {
        vm.startPrank(supporter1);

        soulbound.mint{ value: MIN_WEI }();
        assertEq(soulbound.balanceOf(supporter1), 1);

        soulbound.mint{ value: MIN_WEI }();
        assertEq(soulbound.balanceOf(supporter1), 2);

        soulbound.mint{ value: MIN_WEI }();
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
    /// @dev MinWeiUpdated has no indexed params, so check data payload only
    function test_setMinWei_emitsEvent() public {
        uint256 newMin = 0.001 ether;

        vm.expectEmit(false, false, false, true);
        emit SupportSoulbound.MinWeiUpdated(MIN_WEI, newMin);

        soulbound.setMinWei(newMin);
    }

    /// @notice Non-owner cannot update minimum
    function test_setMinWei_revert_notOwner() public {
        vm.prank(supporter1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, supporter1));
        soulbound.setMinWei(0.001 ether);
    }

    /// @notice setMinWei reverts when zero is passed
    function test_setMinWei_revert_zeroValue() public {
        vm.expectRevert(SupportSoulbound.InvalidMinWei.selector);
        soulbound.setMinWei(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-5192 SOULBOUND TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice locked() returns true for minted tokens
    function test_locked_returnsTrue() public {
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }();

        assertTrue(soulbound.locked(1));
    }

    /// @notice Emits Locked event on mint
    /// @dev Locked(uint256 tokenId) has no indexed params, so tokenId is in data
    function test_mint_emitsLocked() public {
        vm.expectEmit(false, false, false, true);
        emit IERC5192.Locked(1);

        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }();
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
        soulbound.mint{ value: MIN_WEI }();

        vm.prank(supporter1);
        vm.expectRevert(BaseSoulbound.NonTransferrable.selector);
        soulbound.transferFrom(supporter1, supporter2, 1);
    }

    /// @notice safeTransferFrom reverts (via _update override)
    function test_safeTransfer_revert() public {
        vm.prank(supporter1);
        soulbound.mint{ value: MIN_WEI }();

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
        soulbound.mint{ value: 0.025 ether }();

        string memory uri = soulbound.tokenURI(1);

        // Should start with data:application/json;base64,
        assertTrue(bytes(uri).length > 35);
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    /// @notice tokenURI returns non-empty for large donations
    /// @dev Verifies tokenURI handles large donation values without reverting
    function test_tokenURI_handlesLargeDonation() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }();

        // Verify tokenURI returns without error for large donations
        string memory uri = soulbound.tokenURI(1);
        assertTrue(bytes(uri).length > 0, "tokenURI should return non-empty for 1 ETH donation");
    }

    /// @notice SVG contains multilingual switch elements with systemLanguage
    /// @dev Tests SVGRenderer directly to verify translations are embedded for browser language selection
    function test_svgRenderer_containsMultilingualSwitch() public view {
        // Get translations from registry (same as tokenURI would)
        (string[] memory langCodes, string[] memory supportSubtitles) = translations.getAllSupportSubtitles();

        // Render SVG directly using the library
        string memory svg = SVGRenderer.renderSupportSoulbound(
            supporter1, 1, 0.025 ether, "stolenwallet.xyz", langCodes, supportSubtitles
        );

        // The SVG must contain <switch> elements for language selection
        assertTrue(_contains(svg, "<switch>"), "SVG should contain <switch> element");

        // The SVG must contain systemLanguage attributes for non-English languages
        assertTrue(_contains(svg, "systemLanguage"), "SVG should contain systemLanguage attribute");

        // The SVG must contain the Spanish translation (proves non-English languages are included)
        assertTrue(_contains(svg, "Gracias por tu apoyo"), "SVG should contain Spanish support subtitle");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice totalDonations returns sum of all donations
    function test_totalDonations() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 0.5 ether }();

        vm.prank(supporter2);
        soulbound.mint{ value: 0.3 ether }();

        vm.prank(supporter1);
        soulbound.mint{ value: 0.2 ether }();

        assertEq(soulbound.totalDonations(), 1 ether);
    }

    /// @notice getTokensForSupporter returns correct token IDs
    function test_getTokensForSupporter() public {
        vm.startPrank(supporter1);
        soulbound.mint{ value: MIN_WEI }(); // Token 1
        soulbound.mint{ value: MIN_WEI }(); // Token 2
        soulbound.mint{ value: MIN_WEI }(); // Token 3
        vm.stopPrank();

        vm.prank(supporter2);
        soulbound.mint{ value: MIN_WEI }(); // Token 4

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
        soulbound.mint{ value: MIN_WEI }();
        assertEq(soulbound.totalSupply(), 1);

        vm.prank(supporter2);
        soulbound.mint{ value: MIN_WEI }();
        assertEq(soulbound.totalSupply(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE WITHDRAWAL TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw sends balance to feeCollector
    function test_withdraw_success() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }();

        vm.prank(supporter2);
        soulbound.mint{ value: 0.5 ether }();

        uint256 balanceBefore = feeCollector.balance;
        soulbound.withdraw();
        uint256 balanceAfter = feeCollector.balance;

        assertEq(balanceAfter - balanceBefore, 1.5 ether);
        assertEq(address(soulbound).balance, 0);
    }

    /// @notice Only owner can withdraw
    function test_withdraw_revert_notOwner() public {
        vm.prank(supporter1);
        soulbound.mint{ value: 1 ether }();

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
