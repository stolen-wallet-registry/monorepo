// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { TimelockOwnable } from "../libraries/TimelockOwnable.sol";
import { IMessageRecipient } from "@hyperlane-xyz/core/contracts/interfaces/IMessageRecipient.sol";
import { ISoulboundReceiver } from "../interfaces/ISoulboundReceiver.sol";
import { BaseSoulbound } from "./BaseSoulbound.sol";
import { WalletSoulbound } from "./WalletSoulbound.sol";
import { SupportSoulbound } from "./SupportSoulbound.sol";

/// @title SoulboundReceiver
/// @author Stolen Wallet Registry Team
/// @notice Hub chain receiver for cross-chain soulbound mint requests
/// @dev Implements Hyperlane's IMessageRecipient to receive messages from spoke chains.
///      Validates trusted forwarders and executes mints on soulbound contracts.
contract SoulboundReceiver is ISoulboundReceiver, IMessageRecipient, TimelockOwnable, Pausable {
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
        if (_owner == address(0)) revert SoulboundReceiver__ZeroAddress();
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
    /// @dev `payable` because IMessageRecipient.handle is payable from Hyperlane v3. Our dispatches
    ///      set msgValue to 0, so no value is expected here.
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _message) external payable whenNotPaused {
        // Only mailbox can call
        if (msg.sender != mailbox) revert SoulboundReceiver__OnlyMailbox();

        // Validate sender is trusted forwarder for this origin
        address expectedForwarder = _trustedForwarders[_origin];
        address actualSender = address(uint160(uint256(_sender)));

        // Reject non-canonical sender encoding (defense-in-depth for multi-bridge support)
        if (bytes32(uint256(uint160(actualSender))) != _sender) {
            revert SoulboundReceiver__NonCanonicalSender();
        }

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

    /// @notice Execute wallet soulbound mint
    /// @dev Failure handling is deliberately split by cause, because "revert" and "consume" are
    ///      both wrong as blanket policies for a Hyperlane message:
    ///
    ///        - Reverting makes `Mailbox.process` revert, so Hyperlane re-delivers the identical
    ///          body forever and the message is never marked delivered. For a PERMANENT failure
    ///          that is an undeliverable message and a burnt bridge fee, and it is trivially
    ///          griefable: `WalletSoulbound.mintTo` is permissionless, so anyone can front-run
    ///          the bridged request with a direct hub-side mint for ~80k gas and strand it.
    ///          The same thing happens with zero malice when two spokes request the same wallet.
    ///        - Returning on every failure would break the one case where the retry is the
    ///          recovery mechanism: a mint request that arrives BEFORE the wallet's registration
    ///          message. That is transient, and Hyperlane's retry resolves it by itself.
    ///
    ///      So: `NotRegistered` keeps reverting (transient — let the retry fix it); every other
    ///      cause emits {MintFailed} and returns, consuming the message.
    ///
    ///      An EMPTY revert reason also re-reverts. A sub-call out-of-gas surfaces here as an
    ///      empty reason under the 63/64 rule, and consuming the message on an OOG would discard
    ///      a mint that a re-delivery with more gas would have completed.
    ///
    ///      Note the previous code emitted {MintFailed} and then reverted in the same frame, so
    ///      the revert discarded the log — the event that existed to make this observable could
    ///      never actually be observed.
    ///
    ///      The permissionless hub-side `mintTo` remains the manual recovery path for anything
    ///      consumed here.
    /// @param wallet Wallet to mint for (must be registered in StolenWalletRegistry)
    /// @param origin Origin domain for event
    function _handleWalletMint(address wallet, uint32 origin) internal {
        try WalletSoulbound(walletSoulbound).mintTo(wallet) {
            emit CrossChainMintExecuted(MintType.WALLET, wallet, origin);
        } catch (bytes memory reason) {
            emit MintFailed(MintType.WALLET, wallet, origin, reason);
            // Transient: the registration message has not landed yet, or we ran out of gas.
            // Let Hyperlane re-deliver.
            if (reason.length == 0 || _hasSelector(reason, WalletSoulbound.NotRegistered.selector)) {
                revert SoulboundReceiver__WalletMintFailed();
            }
            // Permanent (already minted, or any other terminal cause): consume the message.
        }
    }

    /// @notice Execute support soulbound mint
    /// @dev Same split as {_handleWalletMint}. The transient cause here is `NotAuthorizedMinter`:
    ///      it means this receiver has not been (or has been un-) authorized on the soulbound
    ///      contract, which the owner can fix, after which the retry succeeds. Everything else
    ///      (zero supporter, terminal failures) is consumed.
    /// @param supporter Address to mint for
    /// @param donationAmount Donation amount (for metadata tracking - actual ETH stays on spoke)
    /// @param origin Origin domain for event
    function _handleSupportMint(address supporter, uint256 donationAmount, uint32 origin) internal {
        // Note: Hyperlane doesn't transfer value cross-chain by default.
        // Donation accumulates on spoke chain and is withdrawn separately.
        // We call mintTo which doesn't require ETH - donation is tracked via metadata.
        try SupportSoulbound(supportSoulbound).mintTo(supporter, donationAmount) {
            emit CrossChainMintExecuted(MintType.SUPPORT, supporter, origin);
        } catch (bytes memory reason) {
            emit MintFailed(MintType.SUPPORT, supporter, origin, reason);
            if (reason.length == 0 || _hasSelector(reason, BaseSoulbound.NotAuthorizedMinter.selector)) {
                revert SoulboundReceiver__SupportMintFailed();
            }
        }
    }

    /// @dev Does a captured revert payload start with `selector`?
    /// @param reason Raw revert data from a `try/catch`
    /// @param selector The 4-byte custom-error selector to match
    /// @return True if the payload is at least 4 bytes and its first 4 bytes equal `selector`
    function _hasSelector(bytes memory reason, bytes4 selector) internal pure returns (bool) {
        if (reason.length < 4) return false;
        bytes4 found;
        assembly {
            found := mload(add(reason, 0x20))
        }
        return found == selector;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISoulboundReceiver
    /// @dev Granting trust is immediate during setup and timelocked after completeSetup().
    ///      Passing address(0) un-trusts the domain and stays immediate at all times: it only
    ///      ever narrows what this contract accepts, and it is the targeted emergency response
    ///      to a compromised spoke forwarder (the alternative, pause(), stops every domain).
    function setTrustedForwarder(uint32 domain, address forwarder) external onlyOwner {
        if (forwarder != address(0) && setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        _trustedForwarders[domain] = forwarder;
        emit TrustedForwarderUpdated(domain, forwarder);
    }

    /// @notice Pause cross-chain mint handling
    /// @dev Kill switch for the whole receiver. Hyperlane messages that revert in `handle` are
    ///      not lost — they can be re-processed once unpaused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume cross-chain mint handling
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Propose a trusted forwarder change (2-day delay)
    /// @param domain Hyperlane domain ID
    /// @param forwarder Address of the forwarder contract (must be non-zero)
    function proposeTrustedForwarder(uint32 domain, address forwarder) external onlyOwner {
        if (forwarder == address(0)) revert SoulboundReceiver__ZeroAddress();
        bytes32 actionKey = keccak256(abi.encode("setTrustedForwarder", domain, forwarder));
        _proposeAction(actionKey);
        emit TrustedForwarderProposed(domain, forwarder, actionKey);
    }

    /// @notice Activate a previously proposed trusted forwarder change
    /// @param domain Hyperlane domain ID
    /// @param forwarder Address of the forwarder contract (must be non-zero)
    function activateTrustedForwarder(uint32 domain, address forwarder) external onlyOwner {
        if (forwarder == address(0)) revert SoulboundReceiver__ZeroAddress();
        _activateAction(keccak256(abi.encode("setTrustedForwarder", domain, forwarder)));
        _trustedForwarders[domain] = forwarder;
        emit TrustedForwarderUpdated(domain, forwarder);
    }

    /// @notice Recover ETH held by this contract
    /// @dev `handle` is payable (Hyperlane v3), but our dispatches always set msgValue to 0 —
    ///      any balance here arrived unexpectedly (e.g. a misbehaving hook) and would otherwise
    ///      be locked forever.
    function sweep() external onlyOwner {
        (bool success,) = msg.sender.call{ value: address(this).balance }("");
        if (!success) revert SoulboundReceiver__SweepFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISoulboundReceiver
    function trustedForwarders(uint32 domain) external view returns (address) {
        return _trustedForwarders[domain];
    }

    // Note: No receive() function — ETH is not expected here. `handle` is payable only because
    // Hyperlane v3 requires it; anything a hook does forward can be recovered via sweep().
}
