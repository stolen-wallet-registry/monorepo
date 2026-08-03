// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TimelockOwnable } from "../libraries/TimelockOwnable.sol";
import { ISpokeSoulboundForwarder } from "../interfaces/ISpokeSoulboundForwarder.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";

/// @title SpokeSoulboundForwarder
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain contract for forwarding soulbound mint requests to hub
/// @dev Collects payment and forwards mint requests via Hyperlane.
///      All soulbound tokens are minted on the hub chain - this contract
///      handles cross-chain communication only.
///
///      Owner powers are timelocked (TimelockOwnable). `hubReceiver` is where every mint request
///      users pay bridge fees for ultimately lands, and `setHubConfig` repoints it: setting it to
///      bytes32(0) bricks both mint paths on the HubNotConfigured check, and pointing it at a
///      garbage domain burns real bridge fees on messages nothing will ever handle. Neither is
///      recoverable for the users who already paid, so post-setup the change requires
///      propose → 2 days → activate, matching SpokeRegistry.
contract SpokeSoulboundForwarder is ISpokeSoulboundForwarder, TimelockOwnable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Message type for wallet soulbound mint
    uint8 public constant MSG_TYPE_WALLET = 1;

    /// @notice Message type for support soulbound mint
    uint8 public constant MSG_TYPE_SUPPORT = 2;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Bridge adapter for cross-chain messaging
    IBridgeAdapter public immutable bridgeAdapter;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeSoulboundForwarder
    uint32 public hubDomain;

    /// @inheritdoc ISpokeSoulboundForwarder
    bytes32 public hubReceiver;

    /// @inheritdoc ISpokeSoulboundForwarder
    uint256 public minDonation;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the spoke soulbound forwarder
    /// @param _owner Contract owner
    /// @param _bridgeAdapter IBridgeAdapter implementation (HyperlaneAdapter)
    /// @param _hubDomain Hyperlane domain ID of hub chain
    /// @param _hubReceiver SoulboundReceiver address on hub (as bytes32)
    /// @param _minDonation Minimum donation for support mints
    constructor(address _owner, address _bridgeAdapter, uint32 _hubDomain, bytes32 _hubReceiver, uint256 _minDonation)
        Ownable(_owner)
    {
        if (_bridgeAdapter == address(0)) revert SpokeSoulboundForwarder__ZeroAddress();

        bridgeAdapter = IBridgeAdapter(_bridgeAdapter);
        hubDomain = _hubDomain;
        hubReceiver = _hubReceiver;
        minDonation = _minDonation;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeSoulboundForwarder
    function requestWalletMint(address wallet) external payable {
        if (wallet == address(0)) revert SpokeSoulboundForwarder__ZeroAddress();
        if (hubReceiver == bytes32(0)) revert SpokeSoulboundForwarder__HubNotConfigured();

        // Encode payload: [msgType, wallet, supporter, donationAmount]
        // For wallet mints: supporter=0, donation=0
        bytes memory payload = abi.encode(MSG_TYPE_WALLET, wallet, address(0), uint256(0));

        // Get cross-chain fee
        uint256 fee = bridgeAdapter.quoteMessage(hubDomain, payload);
        if (msg.value < fee) revert SpokeSoulboundForwarder__InsufficientPayment();

        // Send cross-chain message
        bytes32 messageId = bridgeAdapter.sendMessage{ value: fee }(hubDomain, hubReceiver, payload);

        // Refund excess
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeSoulboundForwarder__RefundFailed();
        }

        emit MintRequestForwarded(MintType.WALLET, wallet, msg.sender, messageId);
    }

    /// @inheritdoc ISpokeSoulboundForwarder
    function requestSupportMint(uint256 donationAmount) external payable {
        if (hubReceiver == bytes32(0)) revert SpokeSoulboundForwarder__HubNotConfigured();
        if (donationAmount < minDonation) revert SpokeSoulboundForwarder__DonationBelowMinimum();

        // Encode payload: [msgType, wallet, supporter, donationAmount]
        // For support mints: wallet=supporter (token goes to sender), donation included
        bytes memory payload = abi.encode(MSG_TYPE_SUPPORT, msg.sender, msg.sender, donationAmount);

        // Get cross-chain fee
        uint256 fee = bridgeAdapter.quoteMessage(hubDomain, payload);
        uint256 required = fee + donationAmount;
        if (msg.value < required) revert SpokeSoulboundForwarder__InsufficientPayment();

        // Send cross-chain message with value (donation travels with message)
        // Note: The donation amount is encoded in payload; Hyperlane doesn't transfer value
        // The hub receiver will need to handle donation collection differently
        bytes32 messageId = bridgeAdapter.sendMessage{ value: fee }(hubDomain, hubReceiver, payload);

        // For now, accumulate donations on this contract until withdrawal
        // (Alternative: implement value transfer via Hyperlane hooks in future)

        // Refund excess
        uint256 excess = msg.value - required;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeSoulboundForwarder__RefundFailed();
        }

        emit MintRequestForwarded(MintType.SUPPORT, msg.sender, msg.sender, messageId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeSoulboundForwarder
    function quoteCrossChainFee() external view returns (uint256 fee) {
        if (hubReceiver == bytes32(0)) return 0;

        // Quote with empty payload (fee is generally payload-size independent for Hyperlane)
        bytes memory samplePayload = abi.encode(MSG_TYPE_WALLET, address(0), address(0), uint256(0));
        return bridgeAdapter.quoteMessage(hubDomain, samplePayload);
    }

    /// @inheritdoc ISpokeSoulboundForwarder
    function quoteSupportMintFee(uint256 donationAmount) external view returns (uint256 total) {
        if (hubReceiver == bytes32(0)) return donationAmount;

        bytes memory samplePayload = abi.encode(MSG_TYPE_SUPPORT, address(0), address(0), donationAmount);
        uint256 bridgeFee = bridgeAdapter.quoteMessage(hubDomain, samplePayload);
        return bridgeFee + donationAmount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update hub configuration
    /// @dev Immediate during initial setup, timelocked after completeSetup() — see the contract
    ///      NatSpec for why repointing the hub receiver is a trust-boundary change.
    /// @param _hubDomain Hyperlane domain ID of hub chain
    /// @param _hubReceiver SoulboundReceiver address on hub (as bytes32)
    function setHubConfig(uint32 _hubDomain, bytes32 _hubReceiver) external onlyOwner onlyDuringSetup {
        _setHubConfig(_hubDomain, _hubReceiver);
    }

    /// @notice Propose a hub configuration change (2-day delay before activation)
    /// @param _hubDomain Hyperlane domain ID of hub chain
    /// @param _hubReceiver SoulboundReceiver address on hub (as bytes32)
    function proposeHubConfig(uint32 _hubDomain, bytes32 _hubReceiver) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setHubConfig", _hubDomain, _hubReceiver)));
    }

    /// @notice Activate a previously proposed hub configuration change
    /// @param _hubDomain Hyperlane domain ID of hub chain
    /// @param _hubReceiver SoulboundReceiver address on hub (as bytes32)
    function activateHubConfig(uint32 _hubDomain, bytes32 _hubReceiver) external onlyOwner {
        _activateAction(keccak256(abi.encode("setHubConfig", _hubDomain, _hubReceiver)));
        _setHubConfig(_hubDomain, _hubReceiver);
    }

    function _setHubConfig(uint32 _hubDomain, bytes32 _hubReceiver) internal {
        hubDomain = _hubDomain;
        hubReceiver = _hubReceiver;
        emit HubConfigUpdated(_hubDomain, _bytes32ToAddress(_hubReceiver));
    }

    /// @notice Update minimum donation amount
    /// @param _minDonation New minimum in wei
    function setMinDonation(uint256 _minDonation) external onlyOwner {
        uint256 oldMinDonation = minDonation;
        minDonation = _minDonation;
        emit MinDonationUpdated(oldMinDonation, _minDonation);
    }

    /// @notice Withdraw accumulated donations to treasury
    /// @dev Support mint donations accumulate here until withdrawn
    /// @param to Treasury address
    /// @param amount Amount to withdraw
    function withdrawDonations(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert SpokeSoulboundForwarder__ZeroAddress();
        if (amount > address(this).balance) revert SpokeSoulboundForwarder__InsufficientBalance();
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert SpokeSoulboundForwarder__WithdrawalFailed();
        emit DonationsWithdrawn(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Convert bytes32 to address (for event emission)
    function _bytes32ToAddress(bytes32 b) internal pure returns (address) {
        return address(uint160(uint256(b)));
    }

    /// @notice Accept plain ETH transfers
    /// @dev Required because this contract is the refund recipient for the bridge adapter's
    ///      interchain gas payment: HyperlaneAdapter passes `msg.sender` as the refund address
    ///      in the hook metadata, and Hyperlane's IGP `require`s that refund transfer to
    ///      succeed. On the normal path we pay exactly `quoteDispatch` so the refund is zero,
    ///      but any hook that over-estimates its own postDispatch cost would otherwise turn
    ///      every cross-chain soulbound mint into a revert. SpokeRegistry already has one.
    ///      Anything received here is withdrawable via {withdrawDonations}.
    receive() external payable { }
}
