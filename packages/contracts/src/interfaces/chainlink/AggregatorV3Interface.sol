// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// solhint-disable interface-starts-with-i
/// @title AggregatorV3Interface
/// @author Chainlink
/// @notice Interface for Chainlink price feed aggregators
/// @dev Standard interface for reading price data from Chainlink oracles.
///      This is a standard Chainlink interface - naming convention exception is intentional.
interface AggregatorV3Interface {
    // solhint-enable interface-starts-with-i
    /// @notice Returns the number of decimals in the price feed response
    /// @return The number of decimals (e.g., 8 for ETH/USD)
    function decimals() external view returns (uint8);

    /// @notice Returns a human-readable description of the price feed
    /// @return The description string (e.g., "ETH / USD")
    function description() external view returns (string memory);

    /// @notice Returns the version number of the aggregator
    /// @return The version number
    function version() external view returns (uint256);

    /// @notice Returns historical round data
    /// @param _roundId The round ID to retrieve data for
    /// @return roundId The round ID
    /// @return answer The price answer for the round
    /// @return startedAt Timestamp when the round started
    /// @return updatedAt Timestamp when the round was updated
    /// @return answeredInRound The round ID in which the answer was computed
    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    /// @notice Returns the latest round data
    /// @return roundId The round ID
    /// @return answer The latest price answer
    /// @return startedAt Timestamp when the round started
    /// @return updatedAt Timestamp when the round was last updated
    /// @return answeredInRound The round ID in which the answer was computed
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
