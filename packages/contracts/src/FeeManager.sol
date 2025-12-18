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

    /// @dev Converts Chainlink price to USD cents based on feed decimals
    /// @notice Assumes standard Chainlink ETH/USD feeds (8 decimals, price ~3×10¹¹)
    ///         For exotic feeds with high decimals and small values, result may truncate to 0
    /// @param price Raw price from Chainlink (int256)
    /// @return Price in USD cents (minimum 1 cent to prevent division by zero)
    function _toCents(int256 price) internal view returns (uint256) {
        // Chainlink ETH/USD typically returns 8 decimals
        // To convert to cents (2 decimals), divide by 10^(decimals-2) = 10^6
        uint8 feedDecimals = _priceFeed.decimals();
        uint256 result;
        if (feedDecimals <= 2) {
            result = uint256(price) * 10 ** (2 - feedDecimals);
        } else {
            result = uint256(price) / 10 ** (feedDecimals - 2);
        }
        // Ensure minimum 1 cent to prevent division by zero in fee calculation
        return result > 0 ? result : 1;
    }

    /// @inheritdoc IFeeManager
    /// @dev NOT a view function - opportunistically syncs fallback once per interval
    function getEthPriceUsdCents() public returns (uint256) {
        // Manual-only mode: no oracle configured
        if (address(_priceFeed) == address(0)) {
            return fallbackEthPriceUsdCents;
        }

        // Try to read from Chainlink
        try _priceFeed.latestRoundData() returns (uint80, int256 price, uint256, uint256 updatedAt, uint80) {
            // Check staleness (>4 hours old by default)
            if (block.timestamp - updatedAt > stalePriceThreshold) {
                return fallbackEthPriceUsdCents;
            }
            // Check for invalid price
            if (price <= 0) {
                return fallbackEthPriceUsdCents;
            }

            // Convert to cents using feed's decimals
            uint256 livePrice = _toCents(price);

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
            if (block.timestamp - updatedAt > stalePriceThreshold || price <= 0) {
                return fallbackEthPriceUsdCents;
            }
            return _toCents(price);
        } catch {
            return fallbackEthPriceUsdCents;
        }
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
        if (block.timestamp - updatedAt > stalePriceThreshold) revert Fee__StalePrice();

        uint256 newPrice = _toCents(price);
        fallbackEthPriceUsdCents = newPrice;
        lastFallbackSync = block.timestamp;
        emit FallbackPriceRefreshed(newPrice);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFeeManager
    function setBaseFee(uint256 _baseFeeUsdCents) external onlyOwner {
        uint256 oldFee = baseFeeUsdCents;
        baseFeeUsdCents = _baseFeeUsdCents;
        emit BaseFeeUpdated(oldFee, _baseFeeUsdCents);
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
    /// @notice Setting to 0 triggers sync on every getEthPriceUsdCents() call (higher gas)
    ///         Consider using reasonable minimum (e.g., 1 hour) for normal operation
    function setFallbackSyncInterval(uint256 _fallbackSyncInterval) external onlyOwner {
        uint256 oldInterval = fallbackSyncInterval;
        fallbackSyncInterval = _fallbackSyncInterval;
        emit FallbackSyncIntervalUpdated(oldInterval, _fallbackSyncInterval);
    }
}
