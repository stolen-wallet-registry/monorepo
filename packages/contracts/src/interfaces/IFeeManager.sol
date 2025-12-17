// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFeeManager
/// @author Stolen Wallet Registry Team
/// @notice Interface for the fee management module
/// @dev Handles fee calculation and validation for registry operations.
///      Designed to support future Chainlink price feed integration for
///      dynamic USD-to-ETH conversion.
interface IFeeManager {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the provided fee is less than the required amount
    error Fee__Insufficient();

    /// @notice Thrown when ETH price is stale or invalid
    error Fee__InvalidPrice();

    /// @notice Thrown when attempting to set an invalid base fee
    error Fee__InvalidBaseFee();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when the base fee (in USD cents) is updated
    /// @param oldFee Previous base fee in USD cents
    /// @param newFee New base fee in USD cents
    event BaseFeeUpdated(uint256 indexed oldFee, uint256 indexed newFee);

    /// @notice Emitted when the ETH price is manually updated
    /// @param oldPrice Previous ETH price in USD cents
    /// @param newPrice New ETH price in USD cents
    event EthPriceUpdated(uint256 indexed oldPrice, uint256 indexed newPrice);

    /// @notice Emitted when the Chainlink price feed is configured
    /// @param feed Address of the Chainlink price feed contract
    event PriceFeedConfigured(address indexed feed);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the current fee in wei
    /// @dev Calculates based on base fee (USD) and current ETH price
    /// @return The fee amount in wei
    function currentFeeWei() external view returns (uint256);

    /// @notice Get the base fee in USD cents
    /// @dev Default is $5.00 = 500 cents
    /// @return The base fee in USD cents (e.g., 500 = $5.00)
    function baseFeeUsdCents() external view returns (uint256);

    /// @notice Get the current ETH price in USD cents
    /// @dev Returns manually set price, or Chainlink price if configured
    /// @return The ETH price in USD cents (e.g., 250000 = $2,500.00)
    function ethPriceUsdCents() external view returns (uint256);

    /// @notice Validate that the provided payment meets the required fee
    /// @dev Reverts with Fee__Insufficient if payment is too low
    /// @param payment The amount of ETH provided in wei
    /// @return True if payment is sufficient
    function validateFee(uint256 payment) external view returns (bool);

    /// @notice Get the configured Chainlink price feed address
    /// @return The price feed address (address(0) if not configured)
    function priceFeed() external view returns (address);

    /// @notice Check if Chainlink price feed is configured and active
    /// @return True if using Chainlink for price data
    function useChainlink() external view returns (bool);

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set the base fee in USD cents
    /// @dev Only callable by owner
    /// @param _baseFeeUsdCents The new base fee in USD cents
    function setBaseFee(uint256 _baseFeeUsdCents) external;

    /// @notice Manually set the ETH price (for non-Chainlink operation)
    /// @dev Only callable by owner. Ignored if Chainlink is active.
    /// @param _ethPriceUsdCents The ETH price in USD cents
    function setEthPrice(uint256 _ethPriceUsdCents) external;

    /// @notice Configure Chainlink price feed for automatic ETH price
    /// @dev Only callable by owner. Set to address(0) to disable Chainlink.
    /// @param _priceFeed Address of the Chainlink ETH/USD price feed
    function setPriceFeed(address _priceFeed) external;
}
