// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ERC-5192: Minimal Soulbound NFTs
/// @author EIP-5192 Authors
/// @notice Interface for Soulbound (non-transferable) tokens
/// @dev See https://eips.ethereum.org/EIPS/eip-5192
interface IERC5192 {
    /// @notice Emitted when the locking status is changed to locked.
    /// @dev If a token is minted and the status is locked, this event should be emitted.
    /// @param tokenId The identifier for an NFT.
    event Locked(uint256 tokenId);

    /// @notice Emitted when the locking status is changed to unlocked.
    /// @dev Not used for permanent soulbound tokens.
    /// @param tokenId The identifier for an NFT.
    event Unlocked(uint256 tokenId);

    /// @notice Returns the locking status of an NFT.
    /// @dev NFTs assigned to zero address are considered invalid, and queries
    /// about them do throw.
    /// @param tokenId The identifier for an NFT.
    /// @return True if token is locked (soulbound), false otherwise.
    function locked(uint256 tokenId) external view returns (bool);
}
