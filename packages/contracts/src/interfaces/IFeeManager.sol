// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeManager
/// @author Stolen Wallet Registry Team
/// @notice Interface for the fee management module with Chainlink price feed integration
/// @dev Handles USD-denominated fees with ETH/USD conversion via Chainlink oracle.
///      Falls back to stored price when oracle is unavailable or stale.
interface IFeeManager {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the provided fee is less than the required amount
    error Fee__Insufficient();

    /// @notice Thrown when ETH price is zero or invalid
    error Fee__InvalidPrice();

    /// @notice Thrown when trying to refresh fallback but no oracle is configured
    error Fee__NoOracle();

    /// @notice Thrown when trying to refresh fallback but oracle price is stale
    error Fee__StalePrice();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when the base fee (in USD cents) is updated
    /// @param oldFee Previous base fee in USD cents
    /// @param newFee New base fee in USD cents
    event BaseFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @notice Emitted when the operator batch fee (in USD cents) is updated
    /// @param oldFee Previous batch fee in USD cents
    /// @param newFee New batch fee in USD cents
    event OperatorBatchFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @notice Emitted when the fallback ETH price is manually updated by owner
    /// @param oldPrice Previous fallback price in USD cents
    /// @param newPrice New fallback price in USD cents
    event FallbackPriceUpdated(uint256 oldPrice, uint256 newPrice);

    /// @notice Emitted when fallback price is opportunistically synced from Chainlink
    /// @param newPrice New fallback price in USD cents
    event FallbackPriceSynced(uint256 newPrice);

    /// @notice Emitted when anyone refreshes the fallback price from Chainlink
    /// @param newPrice New fallback price in USD cents
    event FallbackPriceRefreshed(uint256 newPrice);

    /// @notice Emitted when the Chainlink price feed is configured
    /// @param feed Address of the Chainlink price feed contract
    event PriceFeedConfigured(address feed);

    /// @notice Emitted when the stale price threshold is updated
    /// @param oldThreshold Previous threshold in seconds
    /// @param newThreshold New threshold in seconds
    event StalePriceThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    /// @notice Emitted when the fallback sync interval is updated
    /// @param oldInterval Previous interval in seconds
    /// @param newInterval New interval in seconds
    event FallbackSyncIntervalUpdated(uint256 oldInterval, uint256 newInterval);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the current fee in wei
    /// @dev Calculates based on base fee (USD) and current ETH price
    /// @return The fee amount in wei
    function currentFeeWei() external view returns (uint256);

    /// @notice Get the base fee in USD cents
    /// @dev Default is $5.00 = 500 cents. Zero means free registrations.
    /// @return The base fee in USD cents (e.g., 500 = $5.00)
    function baseFeeUsdCents() external view returns (uint256);

    /// @notice Get the operator batch fee in USD cents
    /// @dev Default is $25.00 = 2500 cents. Flat fee per batch submission.
    /// @return The operator batch fee in USD cents (e.g., 2500 = $25.00)
    function operatorBatchFeeUsdCents() external view returns (uint256);

    /// @notice Get the operator batch fee in wei
    /// @dev Calculates based on batch fee (USD) and current ETH price
    /// @return The batch fee amount in wei
    function operatorBatchFeeWei() external view returns (uint256);

    /// @notice Get the fallback ETH price in USD cents
    /// @dev Used when Chainlink is unavailable, stale, or not configured
    /// @return The fallback ETH price in USD cents (e.g., 300000 = $3,000.00)
    function fallbackEthPriceUsdCents() external view returns (uint256);

    /// @notice Get the stale price threshold in seconds
    /// @dev Chainlink data older than this triggers fallback
    /// @return Threshold in seconds (default: 14400 = 4 hours)
    function stalePriceThreshold() external view returns (uint256);

    /// @notice Get the timestamp of last opportunistic fallback sync
    /// @return Unix timestamp of last sync
    function lastFallbackSync() external view returns (uint256);

    /// @notice Get the interval between opportunistic fallback syncs
    /// @dev Fallback is auto-synced from Chainlink at this interval
    /// @return Interval in seconds (default: 86400 = 1 day)
    function fallbackSyncInterval() external view returns (uint256);

    /// @notice Get the configured Chainlink price feed address
    /// @return The price feed address (address(0) if not configured)
    function priceFeed() external view returns (address);

    /// @notice Check if Chainlink price feed is configured
    /// @return True if using Chainlink for price data
    function useChainlink() external view returns (bool);

    /// @notice Get ETH price without triggering sync (pure view function)
    /// @dev Use this for queries that don't want to pay sync gas
    /// @return ETH price in USD cents
    function getEthPriceUsdCentsView() external view returns (uint256);

    /// @notice Validate that the provided payment meets the required fee
    /// @dev Reverts with Fee__Insufficient if payment is too low
    /// @param payment The amount of ETH provided in wei
    /// @return True if payment is sufficient
    function validateFee(uint256 payment) external view returns (bool);

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE-CHANGING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get current ETH price in USD cents (may trigger opportunistic sync)
    /// @dev NOT a view function - syncs fallback if interval has passed.
    ///      Name reflects state mutation. Use getEthPriceUsdCentsView() for pure reads.
    /// @return ETH price in USD cents
    function syncAndGetEthPriceUsdCents() external returns (uint256);

    /// @notice Anyone can sync fallback price from Chainlink
    /// @dev Useful when oracle recovers after being stale - enables self-healing
    /// @dev Reverts if no oracle configured or oracle price is stale
    function refreshFallbackPrice() external;

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set the base fee in USD cents (0 = free registrations)
    /// @dev Only callable by owner
    /// @param _baseFeeUsdCents The new base fee in USD cents
    function setBaseFee(uint256 _baseFeeUsdCents) external;

    /// @notice Set the operator batch fee in USD cents (0 = free batch submissions)
    /// @dev Only callable by owner
    /// @param _operatorBatchFeeUsdCents The new batch fee in USD cents
    function setOperatorBatchFee(uint256 _operatorBatchFeeUsdCents) external;

    /// @notice Set the fallback ETH price manually
    /// @dev Only callable by owner. Used when Chainlink unavailable.
    /// @param _fallbackEthPriceUsdCents The fallback price in USD cents
    function setFallbackPrice(uint256 _fallbackEthPriceUsdCents) external;

    /// @notice Configure Chainlink price feed for automatic ETH price
    /// @dev Only callable by owner. Set to address(0) for manual-only mode.
    /// @param _priceFeed Address of the Chainlink ETH/USD price feed
    function setPriceFeed(address _priceFeed) external;

    /// @notice Set the stale price threshold
    /// @dev Only callable by owner
    /// @param _stalePriceThreshold Threshold in seconds
    function setStalePriceThreshold(uint256 _stalePriceThreshold) external;

    /// @notice Set the fallback sync interval
    /// @dev Only callable by owner
    /// @param _fallbackSyncInterval Interval in seconds
    function setFallbackSyncInterval(uint256 _fallbackSyncInterval) external;
}
