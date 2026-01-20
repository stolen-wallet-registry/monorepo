// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISoulboundReceiver
/// @author Stolen Wallet Registry Team
/// @notice Interface for hub chain soulbound minting receiver
/// @dev Receives cross-chain mint requests from spoke chains and executes
///      the actual mints on WalletSoulbound or SupportSoulbound contracts.
interface ISoulboundReceiver {
    // ═══════════════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Type of soulbound token being minted (must match ISpokeSoulboundForwarder)
    enum MintType {
        WALLET, // Wallet soulbound for registered stolen wallets
        SUPPORT // Support soulbound for protocol donors
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a cross-chain mint is executed
    /// @param mintType Type of token minted
    /// @param wallet Target wallet that received the token
    /// @param originDomain Hyperlane domain ID of the spoke chain
    event CrossChainMintExecuted(MintType indexed mintType, address indexed wallet, uint32 indexed originDomain);

    /// @notice Emitted when trusted forwarder is updated for a spoke domain
    /// @param domain Hyperlane domain ID
    /// @param forwarder SpokeSoulboundForwarder address
    event TrustedForwarderUpdated(uint32 indexed domain, address forwarder);

    /// @notice Emitted when a mint fails (for debugging cross-chain issues)
    /// @param mintType Type of token that failed to mint
    /// @param wallet Target wallet address
    /// @param originDomain Hyperlane domain ID of the spoke chain
    /// @param reason ABI-encoded revert reason from the soulbound contract
    event MintFailed(MintType indexed mintType, address indexed wallet, uint32 indexed originDomain, bytes reason);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when caller is not the Hyperlane mailbox
    error SoulboundReceiver__OnlyMailbox();

    /// @notice Thrown when sender is not a trusted forwarder
    error SoulboundReceiver__UntrustedForwarder();

    /// @notice Thrown when mint type is invalid
    error SoulboundReceiver__InvalidMintType();

    /// @notice Thrown when a zero address is provided
    error SoulboundReceiver__ZeroAddress();

    /// @notice Thrown when wallet mint fails (not registered/already minted)
    error SoulboundReceiver__WalletMintFailed();

    /// @notice Thrown when support mint fails
    error SoulboundReceiver__SupportMintFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set trusted forwarder for a spoke domain
    /// @param domain Hyperlane domain ID of the spoke chain
    /// @param forwarder SpokeSoulboundForwarder address on that chain
    function setTrustedForwarder(uint32 domain, address forwarder) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get trusted forwarder for a spoke domain
    /// @param domain Hyperlane domain ID
    /// @return Forwarder address (address(0) if not set)
    function trustedForwarders(uint32 domain) external view returns (address);

    /// @notice Get the WalletSoulbound contract address
    /// @return The WalletSoulbound contract
    function walletSoulbound() external view returns (address);

    /// @notice Get the SupportSoulbound contract address
    /// @return The SupportSoulbound contract
    function supportSoulbound() external view returns (address);

    /// @notice Get the Hyperlane mailbox address
    /// @return The mailbox contract
    function mailbox() external view returns (address);
}
