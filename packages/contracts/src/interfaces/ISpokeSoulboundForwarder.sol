// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISpokeSoulboundForwarder
/// @author Stolen Wallet Registry Team
/// @notice Interface for spoke chain soulbound minting forwarder
/// @dev Forwards mint requests from spoke chains to hub chain via Hyperlane.
///      All soulbound tokens are minted on the hub chain - this contract only
///      collects payment and forwards the request.
interface ISpokeSoulboundForwarder {
    // ═══════════════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Type of soulbound token being minted
    enum MintType {
        WALLET, // Wallet soulbound for registered stolen wallets
        SUPPORT // Support soulbound for protocol donors
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a mint request is forwarded to the hub
    /// @param mintType Type of token being minted
    /// @param wallet Target wallet for the mint
    /// @param payer Address that paid for the cross-chain mint
    /// @param messageId Hyperlane message ID for tracking
    event MintRequestForwarded(
        MintType indexed mintType, address indexed wallet, address indexed payer, bytes32 messageId
    );

    /// @notice Emitted when hub configuration is updated
    /// @param hubDomain Hyperlane domain ID of hub chain
    /// @param hubReceiver Address of SoulboundReceiver on hub
    event HubConfigUpdated(uint32 indexed hubDomain, address hubReceiver);

    /// @notice Emitted when minimum donation is updated
    /// @param oldMinDonation Previous minimum donation
    /// @param newMinDonation New minimum donation
    event MinDonationUpdated(uint256 oldMinDonation, uint256 newMinDonation);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when payment is less than required fee
    error SpokeSoulboundForwarder__InsufficientPayment();

    /// @notice Thrown when refund transfer fails
    error SpokeSoulboundForwarder__RefundFailed();

    /// @notice Thrown when withdrawal amount exceeds contract balance
    error SpokeSoulboundForwarder__InsufficientBalance();

    /// @notice Thrown when a zero address is provided
    error SpokeSoulboundForwarder__ZeroAddress();

    /// @notice Thrown when hub receiver is not configured
    error SpokeSoulboundForwarder__HubNotConfigured();

    /// @notice Thrown when donation amount is below minimum
    error SpokeSoulboundForwarder__DonationBelowMinimum();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Request a wallet soulbound mint on hub chain
    /// @dev Wallet must be registered/pending in StolenWalletRegistry on hub.
    ///      msg.value must cover cross-chain fee (use quoteCrossChainFee()).
    /// @param wallet The wallet address to mint the soulbound for
    function requestWalletMint(address wallet) external payable;

    /// @notice Request a support soulbound mint on hub chain
    /// @dev msg.value must cover cross-chain fee + donation amount.
    ///      Donation is transferred to hub and collected by fee collector.
    /// @param donationAmount Amount to donate in wei (added to fee)
    function requestSupportMint(uint256 donationAmount) external payable;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get current cross-chain fee estimate for UI display
    /// @return fee The Hyperlane dispatch fee in native currency
    function quoteCrossChainFee() external view returns (uint256 fee);

    /// @notice Get total fee for support mint (cross-chain fee + donation)
    /// @param donationAmount Donation amount in wei
    /// @return total Total fee required (crossChainFee + donationAmount)
    function quoteSupportMintFee(uint256 donationAmount) external view returns (uint256 total);

    /// @notice Get the hub chain Hyperlane domain ID
    /// @return The domain ID
    function hubDomain() external view returns (uint32);

    /// @notice Get the hub receiver address
    /// @return The SoulboundReceiver address on hub (bytes32 for cross-chain)
    function hubReceiver() external view returns (bytes32);

    /// @notice Get minimum donation amount for support mints
    /// @return Minimum donation in wei
    function minDonation() external view returns (uint256);
}
