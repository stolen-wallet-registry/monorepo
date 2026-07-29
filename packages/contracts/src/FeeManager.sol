// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { AggregatorV3Interface } from "./interfaces/chainlink/AggregatorV3Interface.sol";
import { IFeeManager } from "./interfaces/IFeeManager.sol";

/// @title FeeManager
/// @author Stolen Wallet Registry Team
/// @notice Manages USD-denominated fees with Chainlink ETH/USD price feed and manual fallback
/// @dev Uses Chainlink for live pricing, falls back to stored price if oracle is stale/unavailable.
///      Supports opportunistic sync to keep fallback price reasonably fresh.
contract FeeManager is IFeeManager, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Base fee in USD cents (500 = $5.00)
    uint256 public baseFeeUsdCents = 500;

    /// @notice Flat protocol fee per operator batch, in USD cents. Default: 0 (free).
    /// @dev Operator batches are FREE by design.
    ///
    ///      Rationale (see PRPs/operator-fee-removal.md and the operator economics docs for
    ///      the worked figures):
    ///
    ///      - A flat per-batch fee scales with the NUMBER OF BATCHES, not with data volume.
    ///        Large operator datasets require many batch transactions, so the protocol fee
    ///        comes to dominate the actual gas cost by orders of magnitude — enough that
    ///        submitting at scale stops being rational.
    ///      - The fee buys no security here. DAO approval is the trust mechanism for
    ///        operators: they are vetted entities with on-chain identities and reputational
    ///        stake. The individual registration fee still exists and still matters, because
    ///        it deters anonymous sybil spam — a threat operators do not present.
    ///      - Charging for data contribution works against the network effect the registry
    ///        depends on.
    ///
    ///      The fee mechanism is retained (not deleted) so the DAO can enable it later via
    ///      {setOperatorBatchFee} without a redeployment.
    uint256 public operatorBatchFeeUsdCents = 0;

    /// @notice Fallback ETH price in USD cents (300000 = $3,000.00)
    /// @dev Used when Chainlink is unavailable, stale, or not configured
    uint256 public fallbackEthPriceUsdCents = 300_000;

    /// @notice Chainlink price feed interface
    /// @dev address(0) = manual-only mode (no oracle)
    AggregatorV3Interface private _priceFeed;

    /// @notice Maximum age of Chainlink data before falling back to manual price
    /// @dev Default: 14400 seconds (4 hours) - lenient to handle oracle delays
    uint256 public stalePriceThreshold = 14_400;

    /// @notice Timestamp of last opportunistic fallback sync
    uint256 public lastFallbackSync;

    /// @notice Interval between opportunistic fallback syncs
    /// @dev Default: 1 day - keeps fallback reasonably fresh without extra cost
    uint256 public fallbackSyncInterval = 1 days;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the fee manager with optional Chainlink price feed
    /// @param _owner Contract owner (DAO or deployer)
    /// @param priceFeedAddress Chainlink ETH/USD feed address (address(0) for manual-only mode)
    constructor(address _owner, address priceFeedAddress) Ownable(_owner) {
        if (priceFeedAddress != address(0)) {
            _priceFeed = AggregatorV3Interface(priceFeedAddress);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRICE RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Attempts to convert a Chainlink price to USD cents based on feed decimals.
    /// @notice Assumes standard Chainlink ETH/USD feeds (8 decimals, price ~3×10¹¹)
    ///         For exotic feeds with high decimals and small values, result may truncate to 0
    ///
    ///      Returns ok=false instead of reverting when the feed's decimals() call fails or
    ///      returns a value that would make the conversion overflow. Like the _isStale
    ///      underflow, a decimals() revert or an arithmetic panic here would execute inside
    ///      the caller's try SUCCESS branch, where the catch cannot catch it — the panic
    ///      would propagate and brick every fee-collecting registration path. A broken feed
    ///      must degrade to the fallback price, not revert.
    /// @param price Raw price from Chainlink (int256), must be positive (caller checks)
    /// @return ok Whether the conversion succeeded
    /// @return cents Price in USD cents (minimum 1 cent to prevent division by zero)
    function _tryToCents(int256 price) internal view returns (bool ok, uint256 cents) {
        uint8 feedDecimals;
        try _priceFeed.decimals() returns (uint8 d) {
            feedDecimals = d;
        } catch {
            return (false, 0);
        }

        // Chainlink ETH/USD typically returns 8 decimals
        // To convert to cents (2 decimals), divide by 10^(decimals-2) = 10^6
        if (feedDecimals <= 2) {
            // casting to 'uint256' is safe because caller has checked price > 0
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 p = uint256(price);
            // Guard the multiplication: an absurd price would panic past the caller's catch
            if (p > type(uint256).max / 100) return (false, 0);
            cents = p * 10 ** (2 - feedDecimals);
        } else {
            // 10 ** (feedDecimals - 2) overflows uint256 for feedDecimals > 79; treat any
            // such feed as broken rather than panicking
            if (feedDecimals > 77) return (false, 0);
            // casting to 'uint256' is safe because caller has checked price > 0
            // forge-lint: disable-next-line(unsafe-typecast)
            cents = uint256(price) / 10 ** (feedDecimals - 2);
        }
        // Ensure minimum 1 cent to prevent division by zero in fee calculation
        return (true, cents > 0 ? cents : 1);
    }

    /// @inheritdoc IFeeManager
    /// @dev ⚠️ NOT a view function - opportunistically syncs fallback once per interval.
    ///      This function MUTATES STATE when the sync interval has passed.
    ///      If you need a pure read, use getEthPriceUsdCentsView() instead.
    function syncAndGetEthPriceUsdCents() public returns (uint256) {
        // Manual-only mode: no oracle configured
        if (address(_priceFeed) == address(0)) {
            return fallbackEthPriceUsdCents;
        }

        // Try to read from Chainlink
        try _priceFeed.latestRoundData() returns (uint80, int256 price, uint256, uint256 updatedAt, uint80) {
            // Check staleness (>4 hours old by default)
            if (_isStale(updatedAt)) {
                return fallbackEthPriceUsdCents;
            }
            // Check for invalid price
            if (price <= 0) {
                return fallbackEthPriceUsdCents;
            }

            // Convert to cents using feed's decimals; a broken decimals() falls back
            (bool ok, uint256 livePrice) = _tryToCents(price);
            if (!ok) {
                return fallbackEthPriceUsdCents;
            }

            // Opportunistic sync: update fallback if interval has passed
            // Cost: ~100 gas for read + ~10k gas for write (only when triggered)
            // Most calls just add ~100 gas, one user per interval pays ~10k extra
            if (block.timestamp - lastFallbackSync > fallbackSyncInterval) {
                fallbackEthPriceUsdCents = livePrice;
                lastFallbackSync = block.timestamp;
                emit FallbackPriceSynced(livePrice);
            }

            return livePrice;
        } catch {
            // Oracle call failed
            return fallbackEthPriceUsdCents;
        }
    }

    /// @inheritdoc IFeeManager
    function getEthPriceUsdCentsView() public view returns (uint256) {
        if (address(_priceFeed) == address(0)) {
            return fallbackEthPriceUsdCents;
        }

        try _priceFeed.latestRoundData() returns (uint80, int256 price, uint256, uint256 updatedAt, uint80) {
            if (_isStale(updatedAt) || price <= 0) {
                return fallbackEthPriceUsdCents;
            }
            (bool ok, uint256 livePrice) = _tryToCents(price);
            return ok ? livePrice : fallbackEthPriceUsdCents;
        } catch {
            return fallbackEthPriceUsdCents;
        }
    }

    /// @dev Is the feed's last update too old to trust?
    ///
    ///      Written as an explicit comparison rather than `block.timestamp - updatedAt >
    ///      threshold` because that subtraction underflows when a malfunctioning feed reports
    ///      a FUTURE `updatedAt`. The underflow panic happens inside the try's SUCCESS branch,
    ///      so the surrounding `catch` does not catch it — the panic propagates and every fee
    ///      quote reverts, which bricks every registration path that collects a fee.
    ///
    ///      A future or zero timestamp means the feed is misbehaving, so both are treated as
    ///      stale: fall back to the last known-good price instead of reverting.
    function _isStale(uint256 updatedAt) internal view returns (bool) {
        if (updatedAt == 0) return true; // incomplete round
        if (updatedAt > block.timestamp) return true; // future timestamp - feed is broken
        return block.timestamp - updatedAt > stalePriceThreshold;
    }

    /// @inheritdoc IFeeManager
    /// @dev Formula: (baseFeeUsdCents * 1e18) / ethPriceUsdCents
    function currentFeeWei() public view returns (uint256) {
        if (baseFeeUsdCents == 0) return 0; // Free registrations
        uint256 ethPrice = getEthPriceUsdCentsView();
        if (ethPrice == 0) revert Fee__InvalidPrice();
        return (baseFeeUsdCents * 1e18) / ethPrice;
    }

    /// @inheritdoc IFeeManager
    /// @dev Formula: (operatorBatchFeeUsdCents * 1e18) / ethPriceUsdCents
    function operatorBatchFeeWei() public view returns (uint256) {
        if (operatorBatchFeeUsdCents == 0) return 0; // Free batch submissions
        uint256 ethPrice = getEthPriceUsdCentsView();
        if (ethPrice == 0) revert Fee__InvalidPrice();
        return (operatorBatchFeeUsdCents * 1e18) / ethPrice;
    }

    /// @inheritdoc IFeeManager
    function validateFee(uint256 payment) external view returns (bool) {
        uint256 required = currentFeeWei();
        if (payment < required) revert Fee__Insufficient();
        return true;
    }

    /// @inheritdoc IFeeManager
    function priceFeed() external view returns (address) {
        return address(_priceFeed);
    }

    /// @inheritdoc IFeeManager
    function useChainlink() external view returns (bool) {
        return address(_priceFeed) != address(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PERMISSIONLESS FALLBACK REFRESH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFeeManager
    /// @dev Only copies LIVE Chainlink price - caller cannot set arbitrary value
    function refreshFallbackPrice() external {
        if (address(_priceFeed) == address(0)) revert Fee__NoOracle();

        (, int256 price,, uint256 updatedAt,) = _priceFeed.latestRoundData();

        if (price <= 0) revert Fee__InvalidPrice();
        // _isStale, not raw subtraction: a future updatedAt would otherwise panic instead of
        // reverting with the intended Fee__StalePrice.
        if (_isStale(updatedAt)) revert Fee__StalePrice();

        (bool ok, uint256 newPrice) = _tryToCents(price);
        if (!ok) revert Fee__InvalidPrice();
        fallbackEthPriceUsdCents = newPrice;
        lastFallbackSync = block.timestamp;
        emit FallbackPriceRefreshed(newPrice);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFeeManager
    function setBaseFee(uint256 _baseFeeUsdCents) external onlyOwner {
        // Prevent overflow in currentFeeWei calculation: (baseFeeUsdCents * 1e18) / ethPrice
        // Max safe value: type(uint256).max / 1e18 ≈ 1.15e59 (way beyond any realistic fee)
        if (_baseFeeUsdCents > type(uint256).max / 1e18) {
            revert Fee__InvalidPrice();
        }
        uint256 oldFee = baseFeeUsdCents;
        baseFeeUsdCents = _baseFeeUsdCents;
        emit BaseFeeUpdated(oldFee, _baseFeeUsdCents);
    }

    /// @inheritdoc IFeeManager
    function setOperatorBatchFee(uint256 _operatorBatchFeeUsdCents) external onlyOwner {
        // Prevent overflow in operatorBatchFeeWei calculation
        if (_operatorBatchFeeUsdCents > type(uint256).max / 1e18) {
            revert Fee__InvalidPrice();
        }
        uint256 oldFee = operatorBatchFeeUsdCents;
        operatorBatchFeeUsdCents = _operatorBatchFeeUsdCents;
        emit OperatorBatchFeeUpdated(oldFee, _operatorBatchFeeUsdCents);
    }

    /// @inheritdoc IFeeManager
    function setFallbackPrice(uint256 _fallbackEthPriceUsdCents) external onlyOwner {
        if (_fallbackEthPriceUsdCents == 0) revert Fee__InvalidPrice();
        uint256 oldPrice = fallbackEthPriceUsdCents;
        fallbackEthPriceUsdCents = _fallbackEthPriceUsdCents;
        emit FallbackPriceUpdated(oldPrice, _fallbackEthPriceUsdCents);
    }

    /// @inheritdoc IFeeManager
    function setPriceFeed(address priceFeedAddress) external onlyOwner {
        _priceFeed = AggregatorV3Interface(priceFeedAddress);
        emit PriceFeedConfigured(priceFeedAddress);
    }

    /// @inheritdoc IFeeManager
    /// @notice Setting to 0 disables the oracle (all prices considered stale)
    ///         Consider using reasonable minimum (e.g., 1 hour) for normal operation
    function setStalePriceThreshold(uint256 _stalePriceThreshold) external onlyOwner {
        uint256 oldThreshold = stalePriceThreshold;
        stalePriceThreshold = _stalePriceThreshold;
        emit StalePriceThresholdUpdated(oldThreshold, _stalePriceThreshold);
    }

    /// @inheritdoc IFeeManager
    /// @notice Setting to 0 triggers sync on every syncAndGetEthPriceUsdCents() call (higher gas)
    ///         Consider using reasonable minimum (e.g., 1 hour) for normal operation
    function setFallbackSyncInterval(uint256 _fallbackSyncInterval) external onlyOwner {
        uint256 oldInterval = fallbackSyncInterval;
        fallbackSyncInterval = _fallbackSyncInterval;
        emit FallbackSyncIntervalUpdated(oldInterval, _fallbackSyncInterval);
    }
}
