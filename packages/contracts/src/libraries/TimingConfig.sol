// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TimingConfig
/// @author Stolen Wallet Registry Team
/// @notice Library for registration timing calculations
/// @dev Provides randomized grace period and deadline calculations.
///      Uses block.prevrandao for randomization (post-merge Ethereum).
///
/// TIMING BEHAVIOR:
/// - Grace period: Randomized delay before registration can begin
/// - Deadline: Randomized window to complete registration after grace period
/// - Block counts are configurable per-chain to maintain consistent UX
///
/// CHAIN-SPECIFIC CONFIGURATION:
/// Different chains have different block times, so block counts must be adjusted:
/// | Chain          | Block Time | Grace Blocks | Deadline Blocks | Result         |
/// |----------------|------------|--------------|-----------------|----------------|
/// | Anvil (local)  | 13s        | 10           | 50              | ~2 min / ~10 min |
/// | Base/Optimism  | 2s         | 60           | 300             | ~2 min / ~10 min |
/// | Arbitrum       | 0.25s      | 480          | 2400            | ~2 min / ~10 min |
/// | Ethereum L1    | 12s        | 10           | 50              | ~2 min / ~10 min |
///
/// SECURITY NOTES:
/// - Randomization prevents timing attacks and automated phishing
/// - block.prevrandao is NOT cryptographically secure but sufficient for timing
/// - Attackers cannot predict exact grace period start/end times
library TimingConfig {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Maximum additional randomness for timestamps (in seconds)
    /// @dev 30 minutes to match frontend session storage duration
    uint256 internal constant TIMESTAMP_JITTER = 1800;

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Calculate randomized block when grace period ends
    /// @dev Registration can begin after this block
    /// @param graceBlocks Base number of blocks for grace period (chain-specific)
    /// @return Block number when grace period ends
    function getGracePeriodEndBlock(uint256 graceBlocks) internal view returns (uint256) {
        return block.number + getRandomBlockOffset(graceBlocks) + graceBlocks;
    }

    /// @notice Calculate randomized block when registration window closes
    /// @dev Registration must complete before this block
    /// @param deadlineBlocks Base number of blocks for deadline window (chain-specific)
    /// @return Block number when registration window expires
    function getDeadlineBlock(uint256 deadlineBlocks) internal view returns (uint256) {
        return block.number + getRandomBlockOffset(deadlineBlocks) + deadlineBlocks;
    }

    /// @notice Calculate signature deadline timestamp
    /// @dev Used for EIP-712 signature expiry validation. Chain-agnostic (uses timestamp).
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
