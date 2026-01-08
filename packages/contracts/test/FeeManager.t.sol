// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { IFeeManager } from "../src/interfaces/IFeeManager.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

/// @title FeeManagerTest
/// @notice Comprehensive unit tests for FeeManager
contract FeeManagerTest is Test {
    FeeManager public feeManager;
    MockAggregator public mockOracle;

    address public owner;
    address public user;

    // Default values
    uint256 constant DEFAULT_BASE_FEE = 500; // $5.00
    uint256 constant DEFAULT_FALLBACK_PRICE = 300_000; // $3,000.00
    int256 constant ORACLE_PRICE_3000 = 300_000_000_000; // $3,000 with 8 decimals
    int256 constant ORACLE_PRICE_4000 = 400_000_000_000; // $4,000 with 8 decimals
    int256 constant ORACLE_PRICE_2500 = 250_000_000_000; // $2,500 with 8 decimals

    function setUp() public {
        owner = makeAddr("owner");
        user = makeAddr("user");

        // Deploy mock oracle with $3000 ETH price
        mockOracle = new MockAggregator(ORACLE_PRICE_3000);

        // Deploy FeeManager with mock oracle
        vm.prank(owner);
        feeManager = new FeeManager(owner, address(mockOracle));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constructor_WithOracle() public view {
        assertEq(feeManager.owner(), owner);
        assertEq(feeManager.priceFeed(), address(mockOracle));
        assertTrue(feeManager.useChainlink());
        assertEq(feeManager.baseFeeUsdCents(), DEFAULT_BASE_FEE);
        assertEq(feeManager.fallbackEthPriceUsdCents(), DEFAULT_FALLBACK_PRICE);
    }

    function test_Constructor_WithoutOracle() public {
        vm.prank(owner);
        FeeManager noOracleFm = new FeeManager(owner, address(0));

        assertEq(noOracleFm.priceFeed(), address(0));
        assertFalse(noOracleFm.useChainlink());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE CALCULATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_CurrentFeeWei_Calculation() public view {
        // With $3000 ETH (300_000 cents) and $5 fee (500 cents)
        // Formula: (500 * 1e18) / 300000 = 1.666...e15 wei
        uint256 fee = feeManager.currentFeeWei();

        // $5 / $3000 = 0.001666... ETH = 1.666e15 wei
        uint256 expected = (DEFAULT_BASE_FEE * 1e18) / 300_000; // Use cents, not dollars
        assertEq(fee, expected);
    }

    function test_CurrentFeeWei_WithDifferentPrices() public {
        // Test with $2500 ETH (250_000 cents)
        mockOracle.setPrice(ORACLE_PRICE_2500);
        uint256 fee = feeManager.currentFeeWei();
        uint256 expected = (DEFAULT_BASE_FEE * 1e18) / 250_000; // Use cents
        assertEq(fee, expected);

        // Test with $4000 ETH (400_000 cents)
        mockOracle.setPrice(ORACLE_PRICE_4000);
        fee = feeManager.currentFeeWei();
        expected = (DEFAULT_BASE_FEE * 1e18) / 400_000; // Use cents
        assertEq(fee, expected);
    }

    function test_CurrentFeeWei_ZeroBaseFee() public {
        vm.prank(owner);
        feeManager.setBaseFee(0);

        assertEq(feeManager.currentFeeWei(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE VALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ValidateFee_Sufficient() public view {
        uint256 requiredFee = feeManager.currentFeeWei();
        assertTrue(feeManager.validateFee(requiredFee));
        assertTrue(feeManager.validateFee(requiredFee + 1 ether)); // Overpayment is fine
    }

    function test_ValidateFee_Insufficient() public {
        uint256 requiredFee = feeManager.currentFeeWei();

        vm.expectRevert(IFeeManager.Fee__Insufficient.selector);
        feeManager.validateFee(requiredFee - 1);
    }

    function test_ValidateFee_ZeroFeeAlwaysPasses() public {
        vm.prank(owner);
        feeManager.setBaseFee(0);

        assertTrue(feeManager.validateFee(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAINLINK PRICE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ChainlinkPriceUsed_WhenFresh() public view {
        // Oracle price is $3000 (3000_00000000 with 8 decimals)
        // Converted to cents: 3000_00000000 / 1e6 = 300_000 cents = $3,000.00
        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, 300_000);
    }

    function test_FallbackWhenStale() public {
        // Move forward in time so we can set a stale time
        vm.warp(block.timestamp + 10 hours);

        // Make oracle data stale (>4 hours old)
        uint256 staleTime = block.timestamp - 5 hours;
        mockOracle.setUpdatedAt(staleTime);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    function test_FallbackWhenOracleReverts() public {
        mockOracle.setShouldRevert(true);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    function test_FallbackWhenPriceZero() public {
        mockOracle.setPrice(0);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    function test_FallbackWhenPriceNegative() public {
        mockOracle.setPrice(-1);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    function test_ManualModeNoPriceFeed() public {
        vm.prank(owner);
        FeeManager manualFm = new FeeManager(owner, address(0));

        // Should always use fallback in manual mode
        uint256 price = manualFm.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPPORTUNISTIC SYNC TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_OpportunisticSync_Triggers() public {
        // Warp to a reasonable timestamp (sync check: block.timestamp - lastFallbackSync > fallbackSyncInterval)
        // Since lastFallbackSync starts at 0 and fallbackSyncInterval is 1 day,
        // we need block.timestamp > 1 day for first sync
        vm.warp(2 days);
        // Also update oracle timestamp so data isn't stale
        mockOracle.setUpdatedAt(block.timestamp);

        // First call after interval passes - triggers sync
        feeManager.syncAndGetEthPriceUsdCents();
        assertEq(feeManager.fallbackEthPriceUsdCents(), 300_000);
        assertEq(feeManager.lastFallbackSync(), block.timestamp);

        // Change price to $4000
        mockOracle.setPrice(ORACLE_PRICE_4000);

        // Call within interval - no sync
        vm.warp(block.timestamp + 12 hours);
        mockOracle.setUpdatedAt(block.timestamp); // Keep oracle fresh
        feeManager.syncAndGetEthPriceUsdCents();
        assertEq(feeManager.fallbackEthPriceUsdCents(), 300_000); // Still old price

        // Call after interval - triggers sync
        vm.warp(block.timestamp + 13 hours); // Now > 1 day from last sync
        mockOracle.setUpdatedAt(block.timestamp); // Keep oracle fresh
        feeManager.syncAndGetEthPriceUsdCents();
        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000); // New price synced
    }

    function test_OpportunisticSync_SkipsWithinInterval() public {
        // Warp to make initial sync happen
        vm.warp(2 days);
        mockOracle.setUpdatedAt(block.timestamp); // Keep oracle fresh

        // Trigger initial sync
        feeManager.syncAndGetEthPriceUsdCents();
        uint256 firstSync = feeManager.lastFallbackSync();

        // Change price
        mockOracle.setPrice(ORACLE_PRICE_4000);

        // Multiple calls within interval - no new syncs
        vm.warp(block.timestamp + 6 hours);
        mockOracle.setUpdatedAt(block.timestamp); // Keep oracle fresh
        feeManager.syncAndGetEthPriceUsdCents();
        assertEq(feeManager.lastFallbackSync(), firstSync); // Unchanged
        assertEq(feeManager.fallbackEthPriceUsdCents(), 300_000); // Old price
    }

    function test_OpportunisticSync_EmitsEvent() public {
        // Warp to make sync happen
        vm.warp(2 days);
        mockOracle.setUpdatedAt(block.timestamp); // Keep oracle fresh

        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackPriceSynced(300_000);

        feeManager.syncAndGetEthPriceUsdCents();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PERMISSIONLESS REFRESH TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_AnyoneCanRefreshFallback() public {
        // Change oracle price
        mockOracle.setPrice(ORACLE_PRICE_4000);

        // User (not owner) can refresh
        vm.prank(user);
        feeManager.refreshFallbackPrice();

        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000);
    }

    function test_RefreshRevertsIfNoOracle() public {
        vm.prank(owner);
        FeeManager manualFm = new FeeManager(owner, address(0));

        vm.expectRevert(IFeeManager.Fee__NoOracle.selector);
        manualFm.refreshFallbackPrice();
    }

    function test_RefreshRevertsIfStale() public {
        // Move forward in time so we can set a stale time
        vm.warp(block.timestamp + 10 hours);

        // Make oracle data stale
        mockOracle.setUpdatedAt(block.timestamp - 5 hours);

        vm.expectRevert(IFeeManager.Fee__StalePrice.selector);
        feeManager.refreshFallbackPrice();
    }

    function test_RefreshRevertsIfPriceInvalid() public {
        mockOracle.setPrice(0);

        vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
        feeManager.refreshFallbackPrice();
    }

    function test_RefreshEmitsEvent() public {
        mockOracle.setPrice(ORACLE_PRICE_4000);

        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackPriceRefreshed(400_000);

        feeManager.refreshFallbackPrice();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetBaseFee_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        feeManager.setBaseFee(1000);
    }

    function test_SetBaseFee_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.BaseFeeUpdated(500, 1000);

        feeManager.setBaseFee(1000);
        assertEq(feeManager.baseFeeUsdCents(), 1000);
    }

    function test_SetBaseFee_ZeroAllowed() public {
        vm.prank(owner);
        feeManager.setBaseFee(0);
        assertEq(feeManager.baseFeeUsdCents(), 0);
        assertEq(feeManager.currentFeeWei(), 0);
    }

    function test_SetFallbackPrice_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        feeManager.setFallbackPrice(400_000);
    }

    function test_SetFallbackPrice_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackPriceUpdated(300_000, 400_000);

        feeManager.setFallbackPrice(400_000);
        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000);
    }

    function test_SetFallbackPrice_ZeroNotAllowed() public {
        vm.prank(owner);
        vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
        feeManager.setFallbackPrice(0);
    }

    function test_SetPriceFeed_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        feeManager.setPriceFeed(address(0));
    }

    function test_SetPriceFeed_Success() public {
        MockAggregator newOracle = new MockAggregator(ORACLE_PRICE_4000);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.PriceFeedConfigured(address(newOracle));

        feeManager.setPriceFeed(address(newOracle));
        assertEq(feeManager.priceFeed(), address(newOracle));
    }

    function test_SetStalePriceThreshold_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        feeManager.setStalePriceThreshold(1 hours);
    }

    function test_SetStalePriceThreshold_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.StalePriceThresholdUpdated(14_400, 3600);

        feeManager.setStalePriceThreshold(3600);
        assertEq(feeManager.stalePriceThreshold(), 3600);
    }

    function test_SetFallbackSyncInterval_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        feeManager.setFallbackSyncInterval(12 hours);
    }

    function test_SetFallbackSyncInterval_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackSyncIntervalUpdated(1 days, 12 hours);

        feeManager.setFallbackSyncInterval(12 hours);
        assertEq(feeManager.fallbackSyncInterval(), 12 hours);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP TESTS (Ownable2Step)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_TransferOwnership_TwoStep() public {
        address newOwner = makeAddr("newOwner");

        // Step 1: Current owner initiates transfer
        vm.prank(owner);
        feeManager.transferOwnership(newOwner);

        // Ownership hasn't changed yet
        assertEq(feeManager.owner(), owner);
        assertEq(feeManager.pendingOwner(), newOwner);

        // Step 2: New owner accepts
        vm.prank(newOwner);
        feeManager.acceptOwnership();

        assertEq(feeManager.owner(), newOwner);
        assertEq(feeManager.pendingOwner(), address(0));
    }

    function test_TransferOwnership_OnlyPendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        feeManager.transferOwnership(newOwner);

        // Random user cannot accept
        vm.prank(user);
        vm.expectRevert();
        feeManager.acceptOwnership();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function testFuzz_FeeCalculation(uint256 baseFee, int256 ethPrice) public {
        // Bound inputs to reasonable ranges
        baseFee = bound(baseFee, 1, 100_000); // $0.01 to $1000
        // forge-lint: disable-next-line(unsafe-typecast)
        ethPrice = int256(bound(uint256(ethPrice), 10_000_000_000, 10_000_000_000_000)); // $100 to $100,000

        mockOracle.setPrice(ethPrice);

        vm.prank(owner);
        feeManager.setBaseFee(baseFee);

        uint256 fee = feeManager.currentFeeWei();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 expectedPrice = uint256(ethPrice) / 1e6;
        uint256 expectedFee = (baseFee * 1e18) / expectedPrice;

        assertEq(fee, expectedFee);
    }

    function testFuzz_ValidateFee_ThresholdBehavior(uint256 payment) public {
        uint256 requiredFee = feeManager.currentFeeWei();

        if (payment >= requiredFee) {
            assertTrue(feeManager.validateFee(payment));
        } else {
            vm.expectRevert(IFeeManager.Fee__Insufficient.selector);
            feeManager.validateFee(payment);
        }
    }
}
