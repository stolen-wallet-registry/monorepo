// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TimingConfig
/// @author Stolen Wallet Registry Team
/// @notice Library for registration timing calculations
/// @dev Provides randomized grace period and deadline calculations.
///      Uses block.prevrandao for randomization (post-merge Ethereum).
///
/// TIMING CONSTANTS:
/// - Grace period: 1-4 minutes (randomized) before registration can begin
/// - Deadline: 4-13 minutes (randomized) window to complete registration
/// - Block time assumption: ~12 seconds (Ethereum mainnet)
///
/// SECURITY NOTES:
/// - Randomization prevents timing attacks and automated phishing
/// - block.prevrandao is NOT cryptographically secure but sufficient for timing
/// - Attackers cannot predict exact grace period start/end times
library TimingConfig {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS - Configurable per-chain deployment
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum blocks before grace period ends (~1 minute at 12s/block)
    /// @dev Grace period start = current block + random(0, START_TIME_BLOCKS) + START_TIME_BLOCKS
    uint256 internal constant START_TIME_BLOCKS = 5;

    /// @notice Minimum blocks until registration window closes (~10 minutes at 12s/block)
    /// @dev Deadline = current block + random(0, DEADLINE_BLOCKS) + DEADLINE_BLOCKS
    uint256 internal constant DEADLINE_BLOCKS = 50;

    /// @notice Maximum additional randomness for timestamps (in seconds)
    /// @dev 30 minutes to match frontend session storage duration
    uint256 internal constant TIMESTAMP_JITTER = 1800;

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Calculate randomized block when grace period ends
    /// @dev Registration can begin after this block
    /// @return Block number when grace period ends
    function getGracePeriodEndBlock() internal view returns (uint256) {
        return block.number + getRandomBlockOffset(START_TIME_BLOCKS) + START_TIME_BLOCKS;
    }

    /// @notice Calculate randomized block when registration window closes
    /// @dev Registration must complete before this block
    /// @return Block number when registration window expires
    function getDeadlineBlock() internal view returns (uint256) {
        return block.number + getRandomBlockOffset(DEADLINE_BLOCKS) + DEADLINE_BLOCKS;
    }

    /// @notice Calculate signature deadline timestamp
    /// @dev Used for EIP-712 signature expiry validation
    /// @return Timestamp when signature expires
    function getSignatureDeadline() internal view returns (uint256) {
        return block.timestamp + getRandomTimestampOffset() + TIMESTAMP_JITTER;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Generate random block offset for timing calculations
    /// @dev Uses block.prevrandao (post-merge) combined with timestamp and salt for entropy diversity
    /// @param maxOffset Maximum random offset value
    /// @return Random value in range [0, maxOffset)
    function getRandomBlockOffset(uint256 maxOffset) private view returns (uint256) {
        if (maxOffset == 0) return 0;
        bytes32 seed = keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, "block"));
        return uint256(seed) % maxOffset;
    }

    /// @notice Generate random timestamp offset for signature deadlines
    /// @dev Similar to block offset but uses different salt to prevent correlated randomness
    /// @return Random value in range [0, TIMESTAMP_JITTER)
    function getRandomTimestampOffset() private view returns (uint256) {
        bytes32 seed = keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, "timestamp"));
        return uint256(seed) % TIMESTAMP_JITTER;
    }
}
