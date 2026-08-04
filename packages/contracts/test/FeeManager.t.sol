// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
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

    // Constructor should set owner, oracle, and defaults when oracle is provided.
    function test_Constructor_WithOracle() public view {
        assertEq(feeManager.owner(), owner);
        assertEq(feeManager.priceFeed(), address(mockOracle));
        assertTrue(feeManager.useChainlink());
        assertEq(feeManager.baseFeeUsdCents(), DEFAULT_BASE_FEE);
        assertEq(feeManager.fallbackEthPriceUsdCents(), DEFAULT_FALLBACK_PRICE);
    }

    // Constructor should allow manual-only mode with no oracle.
    function test_Constructor_WithoutOracle() public {
        vm.prank(owner);
        FeeManager noOracleFm = new FeeManager(owner, address(0));

        assertEq(noOracleFm.priceFeed(), address(0));
        assertFalse(noOracleFm.useChainlink());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE CALCULATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fee calculation should follow baseFee / ETH price formula.
    function test_CurrentFeeWei_Calculation() public view {
        // With $3000 ETH (300_000 cents) and $5 fee (500 cents)
        // Formula: (500 * 1e18) / 300000 = 1.666...e15 wei
        uint256 fee = feeManager.currentFeeWei();

        // $5 / $3000 = 0.001666... ETH = 1.666e15 wei
        uint256 expected = (DEFAULT_BASE_FEE * 1e18) / 300_000; // Use cents, not dollars
        assertEq(fee, expected);
    }

    // Fee should change inversely with ETH price.
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

    // Zero base fee should make current fee zero.
    function test_CurrentFeeWei_ZeroBaseFee() public {
        vm.prank(owner);
        feeManager.setBaseFee(0);

        assertEq(feeManager.currentFeeWei(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE VALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // validateFee should pass when payment meets or exceeds required fee.
    function test_ValidateFee_Sufficient() public view {
        uint256 requiredFee = feeManager.currentFeeWei();
        assertTrue(feeManager.validateFee(requiredFee));
        assertTrue(feeManager.validateFee(requiredFee + 1 ether)); // Overpayment is fine
    }

    // validateFee should revert when payment is below required fee.
    function test_ValidateFee_Insufficient() public {
        uint256 requiredFee = feeManager.currentFeeWei();

        vm.expectRevert(IFeeManager.Fee__Insufficient.selector);
        feeManager.validateFee(requiredFee - 1);
    }

    // Zero fee should allow validation to pass for any payment.
    function test_ValidateFee_ZeroFeeAlwaysPasses() public {
        vm.prank(owner);
        feeManager.setBaseFee(0);

        assertTrue(feeManager.validateFee(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAINLINK PRICE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fresh oracle data should be used for price resolution.
    function test_ChainlinkPriceUsed_WhenFresh() public view {
        // Oracle price is $3000 (3000_00000000 with 8 decimals)
        // Converted to cents: 3000_00000000 / 1e6 = 300_000 cents = $3,000.00
        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, 300_000);
    }

    // Stale oracle data should fall back to stored price.
    function test_FallbackWhenStale() public {
        // Move forward in time so we can set a stale time
        vm.warp(block.timestamp + 10 hours);

        // Make oracle data stale (>4 hours old)
        uint256 staleTime = block.timestamp - 5 hours;
        mockOracle.setUpdatedAt(staleTime);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    // Oracle reverts should fall back to stored price.
    function test_FallbackWhenOracleReverts() public {
        mockOracle.setShouldRevert(true);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    // Zero oracle price should fall back to stored price.
    function test_FallbackWhenPriceZero() public {
        mockOracle.setPrice(0);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    // Negative oracle price should fall back to stored price.
    function test_FallbackWhenPriceNegative() public {
        mockOracle.setPrice(-1);

        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    // Manual mode should always use fallback price.
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

    // syncAndGetEthPriceUsdCents should update fallback after interval.
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

    // syncAndGetEthPriceUsdCents should not update within interval.
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

    // Opportunistic sync should emit FallbackPriceSynced.
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

    // refreshFallbackPrice should be permissionless.
    function test_AnyoneCanRefreshFallback() public {
        // Change oracle price
        mockOracle.setPrice(ORACLE_PRICE_4000);

        // User (not owner) can refresh
        vm.prank(user);
        feeManager.refreshFallbackPrice();

        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000);
    }

    // refreshFallbackPrice should revert if no oracle is configured.
    function test_RefreshRevertsIfNoOracle() public {
        vm.prank(owner);
        FeeManager manualFm = new FeeManager(owner, address(0));

        vm.expectRevert(IFeeManager.Fee__NoOracle.selector);
        manualFm.refreshFallbackPrice();
    }

    // refreshFallbackPrice should revert if oracle data is stale.
    function test_RefreshRevertsIfStale() public {
        // Move forward in time so we can set a stale time
        vm.warp(block.timestamp + 10 hours);

        // Make oracle data stale
        mockOracle.setUpdatedAt(block.timestamp - 5 hours);

        vm.expectRevert(IFeeManager.Fee__StalePrice.selector);
        feeManager.refreshFallbackPrice();
    }

    // refreshFallbackPrice should revert if oracle price is invalid.
    function test_RefreshRevertsIfPriceInvalid() public {
        mockOracle.setPrice(0);

        vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
        feeManager.refreshFallbackPrice();
    }

    // refreshFallbackPrice should emit FallbackPriceRefreshed.
    function test_RefreshEmitsEvent() public {
        mockOracle.setPrice(ORACLE_PRICE_4000);

        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackPriceRefreshed(400_000);

        feeManager.refreshFallbackPrice();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // setBaseFee should be owner-only.
    function test_SetBaseFee_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.setBaseFee(1000);
    }

    // setBaseFee should update state and emit event.
    function test_SetBaseFee_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.BaseFeeUpdated(500, 1000);

        feeManager.setBaseFee(1000);
        assertEq(feeManager.baseFeeUsdCents(), 1000);
    }

    // setBaseFee should allow zero for free registrations.
    function test_SetBaseFee_ZeroAllowed() public {
        vm.prank(owner);
        feeManager.setBaseFee(0);
        assertEq(feeManager.baseFeeUsdCents(), 0);
        assertEq(feeManager.currentFeeWei(), 0);
    }

    // setBaseFee should reject values that overflow the fee calc.
    function test_SetBaseFee_OverflowReverts() public {
        vm.prank(owner);
        vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
        feeManager.setBaseFee(type(uint256).max / 1e18 + 1);
    }

    // setFallbackPrice should be owner-only.
    function test_SetFallbackPrice_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.setFallbackPrice(400_000);
    }

    // setFallbackPrice should update state and emit event.
    function test_SetFallbackPrice_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackPriceUpdated(300_000, 400_000);

        feeManager.setFallbackPrice(400_000);
        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000);
    }

    // setFallbackPrice should reject zero values.
    function test_SetFallbackPrice_ZeroNotAllowed() public {
        vm.prank(owner);
        vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
        feeManager.setFallbackPrice(0);
    }

    // setPriceFeed should be owner-only.
    function test_SetPriceFeed_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.setPriceFeed(address(0));
    }

    // setPriceFeed should update the oracle address and emit event.
    function test_SetPriceFeed_Success() public {
        MockAggregator newOracle = new MockAggregator(ORACLE_PRICE_4000);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.PriceFeedConfigured(address(newOracle));

        feeManager.setPriceFeed(address(newOracle));
        assertEq(feeManager.priceFeed(), address(newOracle));
    }

    // setStalePriceThreshold should be owner-only.
    function test_SetStalePriceThreshold_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.setStalePriceThreshold(1 hours);
    }

    // setStalePriceThreshold should update state and emit event.
    function test_SetStalePriceThreshold_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.StalePriceThresholdUpdated(14_400, 3600);

        feeManager.setStalePriceThreshold(3600);
        assertEq(feeManager.stalePriceThreshold(), 3600);
    }

    // Zero threshold should force fallback when timestamp is non-zero old.
    function test_SetStalePriceThreshold_ZeroForcesFreshOnly() public {
        vm.prank(owner);
        feeManager.setStalePriceThreshold(0);

        mockOracle.setUpdatedAt(block.timestamp - 1);
        uint256 price = feeManager.getEthPriceUsdCentsView();
        assertEq(price, DEFAULT_FALLBACK_PRICE);
    }

    // setFallbackSyncInterval should be owner-only.
    function test_SetFallbackSyncInterval_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.setFallbackSyncInterval(12 hours);
    }

    // setFallbackSyncInterval should update state and emit event.
    function test_SetFallbackSyncInterval_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IFeeManager.FallbackSyncIntervalUpdated(1 days, 12 hours);

        feeManager.setFallbackSyncInterval(12 hours);
        assertEq(feeManager.fallbackSyncInterval(), 12 hours);
    }

    // Zero interval should sync on every call.
    function test_SetFallbackSyncInterval_ZeroSyncsFrequently() public {
        vm.prank(owner);
        feeManager.setFallbackSyncInterval(0);

        vm.warp(2 days);
        mockOracle.setUpdatedAt(block.timestamp);
        feeManager.syncAndGetEthPriceUsdCents();

        mockOracle.setPrice(ORACLE_PRICE_4000);
        vm.warp(block.timestamp + 1);
        mockOracle.setUpdatedAt(block.timestamp);
        feeManager.syncAndGetEthPriceUsdCents();

        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRICE BOUNDS (the sanity band every price path is clamped to)
    // ═══════════════════════════════════════════════════════════════════════════

    // setPriceBounds applies the band and announces it.
    function test_SetPriceBounds_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit FeeManager.PriceBoundsUpdated(10_000, 1_000_000);

        feeManager.setPriceBounds(10_000, 1_000_000);

        assertEq(feeManager.minEthPriceUsdCents(), 10_000);
        assertEq(feeManager.maxEthPriceUsdCents(), 1_000_000);
    }

    // setPriceBounds is owner-only.
    function test_SetPriceBounds_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.setPriceBounds(10_000, 1_000_000);
    }

    /// @notice The owner-settable band is itself bounded by MIN_PRICE_BOUND / MAX_PRICE_BOUND.
    /// @dev Without the hard limits, "clamp the oracle" is just a second lever with the same reach
    ///      as the first: an owner who can widen the band to [1, type(uint256).max] has re-created
    ///      the unbounded oracle the band exists to constrain. Each of the three clauses is
    ///      exercised separately so a regression that drops one is not masked by the others.
    function test_SetPriceBounds_RejectsBandOutsideHardLimits() public {
        uint256 minBound = feeManager.MIN_PRICE_BOUND();
        uint256 maxBound = feeManager.MAX_PRICE_BOUND();

        // Lower bound beneath the floor.
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidBounds.selector);
        feeManager.setPriceBounds(minBound - 1, 1_000_000);

        // Upper bound above the ceiling.
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidBounds.selector);
        feeManager.setPriceBounds(minBound, maxBound + 1);

        // Inverted band. Both values are individually legal, so only min > max can reject this.
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidBounds.selector);
        feeManager.setPriceBounds(400_000, 200_000);

        assertEq(feeManager.minEthPriceUsdCents(), 5000, "no rejected band may be written");
        assertEq(feeManager.maxEthPriceUsdCents(), 5_000_000, "no rejected band may be written");
    }

    /// @notice Exactly MIN_PRICE_BOUND / MAX_PRICE_BOUND is accepted — the checks are `<` and `>`.
    /// @dev The load-bearing half of the pair above. Without it, a bound mistakenly tightened to
    ///      `<=` / `>=` (rejecting the documented limits) would pass CI, and so would a check that
    ///      rejected every band outright.
    function test_SetPriceBounds_AcceptsExactlyTheHardLimits() public {
        // Read the constants BEFORE vm.prank: an external view in argument position is itself the
        // next call, and it would consume the prank.
        uint256 minBound = feeManager.MIN_PRICE_BOUND();
        uint256 maxBound = feeManager.MAX_PRICE_BOUND();

        vm.prank(owner);
        feeManager.setPriceBounds(minBound, maxBound);

        assertEq(feeManager.minEthPriceUsdCents(), 100);
        assertEq(feeManager.maxEthPriceUsdCents(), 100_000_000);
    }

    /// @notice Narrowing the band must not orphan the fallback price already in storage.
    /// @dev SECURITY. This is the second check in `_setPriceBounds`, and it is the one with no
    ///      obvious motivation from the function signature. If the stored fallback falls outside
    ///      the new band, `_setFallbackPrice` re-checks bounds and can therefore never move it back
    ///      — the contract is wedged holding a fallback it considers invalid, while every degraded
    ///      read path (`getEthPriceUsdCentsView`, `currentFeeWei` after a feed failure) keeps
    ///      quoting exactly that value. Both directions are covered: a band that starts above the
    ///      fallback, and one that ends below it.
    ///
    ///      Discriminating by construction — the preconditions assert each band passes the FIRST
    ///      check, so only the orphan check can be what rejects them.
    function test_SetPriceBounds_RejectsBandThatOrphansStoredFallback() public {
        uint256 stored = feeManager.fallbackEthPriceUsdCents();
        assertEq(stored, DEFAULT_FALLBACK_PRICE, "Precondition: fallback is $3,000");

        // Band entirely ABOVE the stored fallback ($5,000–$10,000).
        uint256 lowMin = 500_000;
        uint256 lowMax = 1_000_000;
        assertTrue(
            lowMin >= feeManager.MIN_PRICE_BOUND() && lowMax <= feeManager.MAX_PRICE_BOUND() && lowMin <= lowMax,
            "precondition: the hard-limit check does not reject this band"
        );
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidBounds.selector);
        feeManager.setPriceBounds(lowMin, lowMax);

        // Band entirely BELOW the stored fallback ($1–$10).
        uint256 highMin = 100;
        uint256 highMax = 1000;
        assertTrue(
            highMin >= feeManager.MIN_PRICE_BOUND() && highMax <= feeManager.MAX_PRICE_BOUND() && highMin <= highMax,
            "precondition: the hard-limit check does not reject this band"
        );
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidBounds.selector);
        feeManager.setPriceBounds(highMin, highMax);

        assertEq(feeManager.minEthPriceUsdCents(), 5000, "orphaning band must not be written");
        assertEq(feeManager.maxEthPriceUsdCents(), 5_000_000, "orphaning band must not be written");

        // A band that still contains the fallback is accepted — proves the rejections above are
        // about the fallback's position, not about narrowing per se.
        vm.prank(owner);
        feeManager.setPriceBounds(200_000, 400_000);
        assertEq(feeManager.minEthPriceUsdCents(), 200_000);
    }

    /// @notice The fallback price is held to the same sanity band as a live oracle answer.
    /// @dev Otherwise the bound on the oracle is trivially sidestepped: set the fallback to 1 cent,
    ///      let the feed go stale, and every read path degrades to a price that drives
    ///      `baseFeeUsdCents * 1e18 / price` to an absurd value. Covers `_setFallbackPrice`'s
    ///      bounds check, which is a different call site from the oracle read path.
    function test_SetFallbackPrice_RejectsValueOutsideBounds() public {
        // Read the band BEFORE arming expectRevert: the cheatcode applies to the next external
        // call, and a view in argument position is one.
        uint256 aboveMax = feeManager.maxEthPriceUsdCents() + 1;

        // Below minEthPriceUsdCents ($50).
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__PriceOutOfBounds.selector);
        feeManager.setFallbackPrice(1);

        // Above maxEthPriceUsdCents ($50,000).
        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__PriceOutOfBounds.selector);
        feeManager.setFallbackPrice(aboveMax);

        assertEq(feeManager.fallbackEthPriceUsdCents(), DEFAULT_FALLBACK_PRICE, "rejected price must not be written");
    }

    /// @notice A fresh oracle answer outside the band is not laundered into the stored fallback.
    /// @dev SECURITY. `refreshFallbackPrice` is PERMISSIONLESS and WRITES storage, which makes it
    ///      the one path where a single bad oracle round becomes durable state: the written value
    ///      outlives the feed's recovery and is what every later degraded read quotes. The bounds
    ///      check is the only thing stopping that, and reverting is safe here precisely because
    ///      nothing depends on this call succeeding.
    ///
    ///      Asserting the revert alone would be weak — the property that matters is that the
    ///      fallback in storage is UNCHANGED, so that is asserted in both directions.
    function test_RefreshFallbackPrice_RejectsOutOfBoundsOracleAnswer() public {
        // $60,000 — fresh, positive, correctly encoded, and above maxEthPriceUsdCents ($50,000).
        mockOracle.setPrice(6_000_000_000_000);

        vm.prank(user);
        vm.expectRevert(FeeManager.Fee__PriceOutOfBounds.selector);
        feeManager.refreshFallbackPrice();

        assertEq(
            feeManager.fallbackEthPriceUsdCents(),
            DEFAULT_FALLBACK_PRICE,
            "an out-of-band answer must not reach the stored fallback"
        );

        // $10 — the dangerous direction for users, since a collapsed price inflates every fee.
        mockOracle.setPrice(1_000_000_000);

        vm.prank(user);
        vm.expectRevert(FeeManager.Fee__PriceOutOfBounds.selector);
        feeManager.refreshFallbackPrice();

        assertEq(
            feeManager.fallbackEthPriceUsdCents(),
            DEFAULT_FALLBACK_PRICE,
            "an out-of-band answer must not reach the stored fallback"
        );

        // An in-band answer still writes, so the guard is not simply refusing everything.
        mockOracle.setPrice(ORACLE_PRICE_4000);
        vm.prank(user);
        feeManager.refreshFallbackPrice();
        assertEq(feeManager.fallbackEthPriceUsdCents(), 400_000, "an in-band answer must still refresh");
    }

    /// @notice The staleness threshold is capped at MAX_STALE_PRICE_THRESHOLD.
    /// @dev Without the cap the owner sets the threshold to `type(uint256).max`, every answer is
    ///      "fresh" forever, and staleness detection is off — a feed frozen at a stale price keeps
    ///      being treated as live, which is strictly worse than having no oracle at all because the
    ///      contract believes it has one.
    function test_SetStalePriceThreshold_RejectsAboveCap() public {
        uint256 cap = feeManager.MAX_STALE_PRICE_THRESHOLD();

        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidThreshold.selector);
        feeManager.setStalePriceThreshold(cap + 1);

        vm.prank(owner);
        vm.expectRevert(FeeManager.Fee__InvalidThreshold.selector);
        feeManager.setStalePriceThreshold(type(uint256).max);

        assertEq(feeManager.stalePriceThreshold(), 14_400, "rejected threshold must not be written");
    }

    /// @notice Exactly MAX_STALE_PRICE_THRESHOLD is accepted — the check is `>`, not `>=`.
    /// @dev Paired with the rejection above so an off-by-one in either direction breaks exactly
    ///      one of the two.
    function test_SetStalePriceThreshold_AcceptsExactlyTheCap() public {
        uint256 cap = feeManager.MAX_STALE_PRICE_THRESHOLD();

        vm.prank(owner);
        feeManager.setStalePriceThreshold(cap);

        assertEq(feeManager.stalePriceThreshold(), 7 days);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP TESTS (Ownable2Step)
    // ═══════════════════════════════════════════════════════════════════════════

    // Ownership transfer should follow the two-step flow.
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

    // Only pending owner should be able to accept ownership.
    function test_TransferOwnership_OnlyPendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        feeManager.transferOwnership(newOwner);

        // Random user cannot accept
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        feeManager.acceptOwnership();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fuzz test: fee calculation should match the formula across a wide range
    // of base fees and ETH prices.
    function testFuzz_FeeCalculation(uint256 baseFee, int256 ethPrice) public {
        // Bound inputs to reasonable ranges
        baseFee = bound(baseFee, 1, 100_000); // $0.01 to $1000
        // Kept inside the oracle sanity band ($50 to $50,000, see MIN/MAX_PRICE_BOUND and
        // _withinBounds). This range used to run to $100,000; above maxEthPriceUsdCents the
        // contract now correctly rejects the answer and returns the fallback price, so the
        // live-price formula asserted below would not apply. Out-of-band behaviour is covered
        // separately by test_FuzzRange_AbovePriceBound_FallsBack.
        // forge-lint: disable-next-line(unsafe-typecast)
        ethPrice = int256(bound(uint256(ethPrice), 5_000_000_000, 5_000_000_000_000)); // $50 to $50,000

        mockOracle.setPrice(ethPrice);

        vm.prank(owner);
        feeManager.setBaseFee(baseFee);

        uint256 fee = feeManager.currentFeeWei();
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 expectedPrice = uint256(ethPrice) / 1e6;
        uint256 expectedFee = (baseFee * 1e18) / expectedPrice;

        assertEq(fee, expectedFee);
    }

    // Companion to testFuzz_FeeCalculation, which was narrowed to the oracle sanity band when
    // V10 added bounds. This covers the range that narrowing gave up: a fresh, positive,
    // correctly-encoded answer ABOVE maxEthPriceUsdCents must be rejected in favour of the last
    // known-good fallback, not used.
    //
    // This matters because the rejected direction is the dangerous one for the protocol rather
    // than for the user: an absurdly high ETH price drives `baseFeeUsdCents * 1e18 / price`
    // toward zero, making registration effectively free and removing the fee's sybil deterrent.
    // Falling back (rather than reverting) is deliberate — a revert here would brick every
    // fee-collecting registration path, which is strictly worse than quoting a stale price.
    function test_FuzzRange_AbovePriceBound_FallsBack(int256 ethPrice) public {
        uint256 maxCents = feeManager.maxEthPriceUsdCents();
        // Just above the bound, up to the $1,000,000 hard ceiling. 1e6 converts cents -> 8-dec.
        // forge-lint: disable-next-line(unsafe-typecast)
        ethPrice = int256(bound(uint256(ethPrice), (maxCents + 1) * 1e6, 100_000_000 * 1e6));

        mockOracle.setPrice(ethPrice);

        // The fallback is still the constructor default: no in-bounds answer has synced it.
        assertEq(feeManager.getEthPriceUsdCentsView(), DEFAULT_FALLBACK_PRICE);
        assertEq(feeManager.currentFeeWei(), (DEFAULT_BASE_FEE * 1e18) / DEFAULT_FALLBACK_PRICE);
    }

    // The mirror of the above on the low side. A near-zero answer is the more intuitive attack:
    // it inflates the ETH-denominated fee without bound ($1/ETH prices a $5 registration at
    // 5 ETH), so a manipulated feed could price victims out of registering entirely.
    function test_FuzzRange_BelowPriceBound_FallsBack(int256 ethPrice) public {
        uint256 minCents = feeManager.minEthPriceUsdCents();
        // 1 cent up to just under the bound.
        // forge-lint: disable-next-line(unsafe-typecast)
        ethPrice = int256(bound(uint256(ethPrice), 1e6, (minCents - 1) * 1e6));

        mockOracle.setPrice(ethPrice);

        assertEq(feeManager.getEthPriceUsdCentsView(), DEFAULT_FALLBACK_PRICE);
        assertEq(feeManager.currentFeeWei(), (DEFAULT_BASE_FEE * 1e18) / DEFAULT_FALLBACK_PRICE);
    }

    // Fuzz test: validateFee should accept payments >= required and reject
    // those below, across a wide range of values.
    function testFuzz_ValidateFee_ThresholdBehavior(uint256 payment) public {
        uint256 requiredFee = feeManager.currentFeeWei();

        if (payment >= requiredFee) {
            assertTrue(feeManager.validateFee(payment));
        } else {
            vm.expectRevert(IFeeManager.Fee__Insufficient.selector);
            feeManager.validateFee(payment);
        }
    }

    // Fuzz test: setBaseFee should handle extreme values near overflow boundary.
    function testFuzz_SetBaseFee_ExtremeBoundary(uint256 baseFee) public {
        // The contract prevents overflow in currentFeeWei calculation: (baseFeeUsdCents * 1e18) / ethPrice
        // Max safe value: type(uint256).max / 1e18
        uint256 maxSafeBaseFee = type(uint256).max / 1e18;

        vm.prank(owner);
        if (baseFee > maxSafeBaseFee) {
            // Values above overflow threshold should revert
            vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
            feeManager.setBaseFee(baseFee);
        } else {
            // All other values should succeed (including 0 for free registrations)
            feeManager.setBaseFee(baseFee);
            assertEq(feeManager.baseFeeUsdCents(), baseFee);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ORACLE TIMESTAMP SANITY (regression)
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // The staleness check used to be `block.timestamp - updatedAt > stalePriceThreshold`.
    // A feed reporting a FUTURE updatedAt makes that subtraction underflow, and because the
    // check runs inside the try's SUCCESS branch the surrounding catch does not catch the
    // panic — it propagates, so every fee quote reverts and every fee-collecting
    // registration path is bricked for as long as the feed misbehaves.

    // A future updatedAt must fall back to the last known-good price, never revert.
    function test_FutureUpdatedAt_FallsBackInsteadOfReverting() public {
        mockOracle.setUpdatedAt(block.timestamp + 1 hours);

        // Would panic (0x11 arithmetic underflow) before the fix
        assertEq(feeManager.getEthPriceUsdCentsView(), DEFAULT_FALLBACK_PRICE);
        assertEq(feeManager.syncAndGetEthPriceUsdCents(), DEFAULT_FALLBACK_PRICE);
    }

    // The fee quotes that gate every registration must survive a future-timestamped feed.
    function test_FutureUpdatedAt_FeeQuotesStillWork() public {
        mockOracle.setUpdatedAt(block.timestamp + 1 days);

        uint256 expected = (DEFAULT_BASE_FEE * 1e18) / DEFAULT_FALLBACK_PRICE;
        assertEq(feeManager.currentFeeWei(), expected);
        assertTrue(feeManager.validateFee(expected));
    }

    // refreshFallbackPrice should surface the intended error, not an arithmetic panic.
    function test_FutureUpdatedAt_RefreshRevertsWithStalePrice() public {
        mockOracle.setUpdatedAt(block.timestamp + 1 hours);

        vm.expectRevert(IFeeManager.Fee__StalePrice.selector);
        feeManager.refreshFallbackPrice();
    }

    // updatedAt == 0 means an incomplete round; treat it as stale rather than as
    // "block.timestamp seconds old", which would pass the threshold check on a young chain.
    function test_ZeroUpdatedAt_TreatedAsStale() public {
        mockOracle.setUpdatedAt(0);

        assertEq(feeManager.getEthPriceUsdCentsView(), DEFAULT_FALLBACK_PRICE);

        vm.expectRevert(IFeeManager.Fee__StalePrice.selector);
        feeManager.refreshFallbackPrice();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ORACLE DECIMALS SANITY (regression)
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // decimals() used to be called unguarded inside _toCents, which runs inside the try's
    // SUCCESS branch — the same panic-escapes-catch shape as the updatedAt underflow above.
    // A feed whose decimals() reverts (or returns a value making 10**(d-2) overflow) would
    // brick every fee quote instead of falling back.

    // A reverting decimals() must fall back to the last known-good price, never revert.
    function test_RevertingDecimals_FallsBackInsteadOfReverting() public {
        mockOracle.setDecimalsShouldRevert(true);

        // Would propagate OracleCallFailed past the catch before the fix
        assertEq(feeManager.getEthPriceUsdCentsView(), DEFAULT_FALLBACK_PRICE);
        assertEq(feeManager.syncAndGetEthPriceUsdCents(), DEFAULT_FALLBACK_PRICE);

        uint256 expected = (DEFAULT_BASE_FEE * 1e18) / DEFAULT_FALLBACK_PRICE;
        assertEq(feeManager.currentFeeWei(), expected);
    }

    // A decimals() value large enough to overflow 10**(d-2) must fall back, not panic.
    function test_HugeDecimals_FallsBackInsteadOfPanicking() public {
        mockOracle.setDecimals(100);

        // Would panic (0x11 overflow computing 10**98) before the fix
        assertEq(feeManager.getEthPriceUsdCentsView(), DEFAULT_FALLBACK_PRICE);
        assertEq(feeManager.syncAndGetEthPriceUsdCents(), DEFAULT_FALLBACK_PRICE);
    }

    // The manual refresh path should surface a clean error for an unusable feed.
    function test_RevertingDecimals_RefreshRevertsWithInvalidPrice() public {
        mockOracle.setDecimalsShouldRevert(true);

        vm.expectRevert(IFeeManager.Fee__InvalidPrice.selector);
        feeManager.refreshFallbackPrice();
    }

    // Non-standard but valid decimals still price correctly (18-decimal feed).
    function test_EighteenDecimals_PricesCorrectly() public {
        mockOracle.setDecimals(18);
        mockOracle.setPrice(3000e18); // $3,000 with 18 decimals

        assertEq(feeManager.getEthPriceUsdCentsView(), 300_000); // $3,000.00 in cents
    }
}
