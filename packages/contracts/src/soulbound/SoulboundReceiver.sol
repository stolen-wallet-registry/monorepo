// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IMessageRecipient } from "@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient.sol";
import { ISoulboundReceiver } from "../interfaces/ISoulboundReceiver.sol";
import { WalletSoulbound } from "./WalletSoulbound.sol";
import { SupportSoulbound } from "./SupportSoulbound.sol";

/// @title SoulboundReceiver
/// @author Stolen Wallet Registry Team
/// @notice Hub chain receiver for cross-chain soulbound mint requests
/// @dev Implements Hyperlane's IMessageRecipient to receive messages from spoke chains.
///      Validates trusted forwarders and executes mints on soulbound contracts.
contract SoulboundReceiver is ISoulboundReceiver, IMessageRecipient, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Message type for wallet soulbound mint (must match SpokeSoulboundForwarder)
    uint8 public constant MSG_TYPE_WALLET = 1;

    /// @notice Message type for support soulbound mint (must match SpokeSoulboundForwarder)
    uint8 public constant MSG_TYPE_SUPPORT = 2;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISoulboundReceiver
    address public immutable mailbox;

    /// @inheritdoc ISoulboundReceiver
    address public immutable walletSoulbound;

    /// @inheritdoc ISoulboundReceiver
    address public immutable supportSoulbound;

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Mapping of domain ID => trusted forwarder address
    mapping(uint32 => address) private _trustedForwarders;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the soulbound receiver
    /// @param _owner Contract owner
    /// @param _mailbox Hyperlane mailbox address
    /// @param _walletSoulbound WalletSoulbound contract address
    /// @param _supportSoulbound SupportSoulbound contract address
    constructor(address _owner, address _mailbox, address _walletSoulbound, address _supportSoulbound) Ownable(_owner) {
        if (_mailbox == address(0)) revert SoulboundReceiver__ZeroAddress();
        if (_walletSoulbound == address(0)) revert SoulboundReceiver__ZeroAddress();
        if (_supportSoulbound == address(0)) revert SoulboundReceiver__ZeroAddress();

        mailbox = _mailbox;
        walletSoulbound = _walletSoulbound;
        supportSoulbound = _supportSoulbound;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HYPERLANE MESSAGE RECIPIENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Handle incoming cross-chain mint requests from Hyperlane
    /// @dev Only callable by Hyperlane mailbox. Validates source and executes mint.
    /// @param _origin Origin chain domain ID
    /// @param _sender Sender address on origin chain (bytes32)
    /// @param _message Encoded payload: [msgType, wallet, supporter, donationAmount]
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _message) external {
        // Only mailbox can call
        if (msg.sender != mailbox) revert SoulboundReceiver__OnlyMailbox();

        // Validate sender is trusted forwarder for this origin
        address expectedForwarder = _trustedForwarders[_origin];
        address actualSender = address(uint160(uint256(_sender)));
        if (actualSender != expectedForwarder || expectedForwarder == address(0)) {
            revert SoulboundReceiver__UntrustedForwarder();
        }

        // Decode payload
        (uint8 msgType, address wallet, address supporter, uint256 donationAmount) =
            abi.decode(_message, (uint8, address, address, uint256));

        if (msgType == MSG_TYPE_WALLET) {
            _handleWalletMint(wallet, _origin);
        } else if (msgType == MSG_TYPE_SUPPORT) {
            _handleSupportMint(supporter, donationAmount, _origin);
        } else {
            revert SoulboundReceiver__InvalidMintType();
        }
    }

    /// @dev Execute wallet soulbound mint
    /// @param wallet Wallet to mint for (must be registered in StolenWalletRegistry)
    /// @param origin Origin domain for event
    function _handleWalletMint(address wallet, uint32 origin) internal {
        // Call WalletSoulbound.mintTo - it will revert if wallet is not registered
        // or if already minted (those checks are in WalletSoulbound)
        try WalletSoulbound(walletSoulbound).mintTo(wallet) {
            emit CrossChainMintExecuted(MintType.WALLET, wallet, origin);
        } catch {
            revert SoulboundReceiver__WalletMintFailed();
        }
    }

    /// @dev Execute support soulbound mint
    /// @param supporter Address to mint for
    /// @param donationAmount Donation amount (for metadata tracking - actual ETH stays on spoke)
    /// @param origin Origin domain for event
    function _handleSupportMint(address supporter, uint256 donationAmount, uint32 origin) internal {
        // Note: Hyperlane doesn't transfer value cross-chain by default.
        // Donation accumulates on spoke chain and is withdrawn separately.
        // We call mintTo which doesn't require ETH - donation is tracked via metadata.
        try SupportSoulbound(supportSoulbound).mintTo(supporter, donationAmount) {
            emit CrossChainMintExecuted(MintType.SUPPORT, supporter, origin);
        } catch {
            revert SoulboundReceiver__SupportMintFailed();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISoulboundReceiver
    function setTrustedForwarder(uint32 domain, address forwarder) external onlyOwner {
        _trustedForwarders[domain] = forwarder;
        emit TrustedForwarderUpdated(domain, forwarder);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISoulboundReceiver
    function trustedForwarders(uint32 domain) external view returns (address) {
        return _trustedForwarders[domain];
    }

    /// @notice Allow contract to receive ETH for support mints
    receive() external payable { }
}
