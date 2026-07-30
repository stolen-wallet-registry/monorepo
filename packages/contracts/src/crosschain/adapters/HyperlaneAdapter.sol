// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TimelockOwnable } from "../../libraries/TimelockOwnable.sol";
import { IBridgeAdapter } from "../../interfaces/IBridgeAdapter.sol";
import { CrossChainMessage } from "../../libraries/CrossChainMessage.sol";
import { BatchLimits } from "../../libraries/BatchLimits.sol";
import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import { StandardHookMetadata } from "@hyperlane-xyz/core/contracts/hooks/libs/StandardHookMetadata.sol";

/// @title HyperlaneAdapter
/// @author Stolen Wallet Registry Team
/// @notice IBridgeAdapter implementation for Hyperlane messaging protocol
/// @dev Targets the Hyperlane v3+ Mailbox: `dispatch` is payable and fees are quoted through
///      `quoteDispatch`, which sums the required hook (protocol fee) and the default hook
///      (interchain gas payment). The pre-v3 `dispatch`-then-`IInterchainGasPaymaster.payForGas`
///      flow no longer exists; on a live v3 mailbox it reverts, because the default post-dispatch
///      hook rejects a zero-value dispatch.
///
///      Destination gas is quoted from the payload rather than a flat constant. Hub-side execution
///      cost scales linearly with the number of entries in a message, so a fixed quote under-funds
///      every batch past a handful of entries and the Hyperlane relayer silently declines to
///      execute it — while the spoke has already consumed the nonce, cleared the acknowledgement,
///      and kept the fee.
///
///      Owner powers are timelocked (TimelockOwnable), because the destination trusts THIS
///      CONTRACT as the origin sender: an owner who can grant dispatch rights can mint a
///      universal forgery oracle for the hub in one transaction. Grants therefore go through
///      propose → 2 days → activate once setup is complete, while revocations stay immediate so
///      a compromised spoke contract can be cut off without waiting out the delay.
contract HyperlaneAdapter is IBridgeAdapter, TimelockOwnable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Default fixed destination gas, independent of entry count
    /// @dev Covers `Mailbox.process` → ISM verification → `CrossChainInbox.handle` decode and
    ///      dispatch into the hub, before any per-entry storage writes.
    uint256 public constant DEFAULT_BASE_GAS = 200_000;

    /// @notice Default destination gas charged per entry in a batch message
    /// @dev Measured cost is ~26,200 gas per entry (cold SSTORE ~22,100 + event ~2,000 + loop and
    ///      keccak overhead ~2,100); see `test/GasMeasurement.t.sol`. Quoted at 35,000 to absorb
    ///      gas-schedule changes and destination base-fee movement between quote and execution.
    uint256 public constant DEFAULT_PER_ENTRY_GAS = 35_000;

    /// @notice Upper bound on the destination gas limit this adapter will quote or dispatch
    /// @dev A malformed or hostile entry count must not be able to quote an unpayable fee. Sits
    ///      above the ~950-entry ceiling a 25M-gas destination block can execute anyway.
    uint256 public constant MAX_GAS_LIMIT = 30_000_000;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hyperlane Mailbox contract (v3+)
    IMailbox public immutable mailbox;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mapping of supported destination Hyperlane domain IDs
    mapping(uint32 => bool) public supportedDomains;

    /// @notice Per-domain override of the fixed destination gas (0 = use DEFAULT_BASE_GAS)
    mapping(uint32 => uint256) public baseGasAmounts;

    /// @notice Per-domain override of the per-entry destination gas (0 = use DEFAULT_PER_ENTRY_GAS)
    mapping(uint32 => uint256) public perEntryGasAmounts;

    /// @notice Contracts permitted to dispatch messages through this adapter
    /// @dev The destination-side CrossChainInbox and SoulboundReceiver trust this adapter as the
    ///      origin sender, because Hyperlane records the adapter (not its caller) as the dispatcher.
    ///      Without this allowlist any address could dispatch a forged payload that the destination
    ///      would accept as a legitimate spoke message.
    mapping(address => bool) public authorizedSenders;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when refund transfer fails
    error HyperlaneAdapter__RefundFailed();

    /// @notice Thrown when a zero address is provided for a required parameter
    error HyperlaneAdapter__ZeroAddress();

    /// @notice Thrown when too many domains are provided in batch operation
    error HyperlaneAdapter__TooManyDomains();

    /// @notice Thrown when a caller that is not on the allowlist attempts to dispatch a message
    error HyperlaneAdapter__UnauthorizedSender();

    /// @notice Thrown when the payload's entry count would require more destination gas than MAX_GAS_LIMIT
    error HyperlaneAdapter__GasLimitExceeded();

    /// @notice Thrown when a proposed gas model would make a maximum-size batch exceed MAX_GAS_LIMIT
    error HyperlaneAdapter__GasConfigExceedsLimit();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a domain is added or removed from supported list
    /// @param domain Hyperlane domain ID that was updated
    /// @param supported True if domain is now supported, false if removed
    event DomainSupportUpdated(uint32 indexed domain, bool supported);

    /// @notice Emitted when the gas model is updated for a domain
    /// @param domain Hyperlane domain ID for which gas was updated
    /// @param baseGas New fixed gas amount (0 = use DEFAULT_BASE_GAS)
    /// @param perEntryGas New per-entry gas amount (0 = use DEFAULT_PER_ENTRY_GAS)
    event GasAmountUpdated(uint32 indexed domain, uint256 baseGas, uint256 perEntryGas);

    /// @notice Emitted when a sender is added to or removed from the dispatch allowlist
    /// @param sender Address whose authorization changed
    /// @param authorized True if the sender may now dispatch, false if revoked
    event AuthorizedSenderUpdated(address indexed sender, bool authorized);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the Hyperlane adapter
    /// @dev No gas paymaster argument: from v3 the interchain gas payment is collected by the
    ///      mailbox's default post-dispatch hook as part of `dispatch`.
    /// @param _owner Contract owner
    /// @param _mailbox Hyperlane Mailbox address on this chain
    constructor(address _owner, address _mailbox) Ownable(_owner) {
        if (_mailbox == address(0)) revert HyperlaneAdapter__ZeroAddress();
        mailbox = IMailbox(_mailbox);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // IBridgeAdapter IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IBridgeAdapter
    function sendMessage(uint32 destinationChain, bytes32 recipient, bytes calldata payload)
        external
        payable
        returns (bytes32 messageId)
    {
        if (!authorizedSenders[msg.sender]) {
            revert HyperlaneAdapter__UnauthorizedSender();
        }

        if (!supportedDomains[destinationChain]) {
            revert BridgeAdapter__UnsupportedChain();
        }

        // Identical derivation to quoteMessage, so a caller that quotes then sends the quoted
        // amount in the same transaction can never be short.
        bytes memory metadata = _hookMetadata(destinationChain, payload);
        uint256 fee = mailbox.quoteDispatch(destinationChain, recipient, payload, metadata);

        if (msg.value < fee) {
            revert BridgeAdapter__InsufficientFee();
        }

        messageId = mailbox.dispatch{ value: fee }(destinationChain, recipient, payload, metadata);

        // Refund excess
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert HyperlaneAdapter__RefundFailed();
        }

        emit MessageSent(messageId, destinationChain, recipient, payload);
    }

    /// @inheritdoc IBridgeAdapter
    /// @dev Payload-aware: the quote scales with the number of entries the destination will write.
    function quoteMessage(uint32 destinationChain, bytes calldata payload) external view returns (uint256 fee) {
        if (!supportedDomains[destinationChain]) {
            revert BridgeAdapter__UnsupportedChain();
        }

        // The recipient does not affect any hook's quote, and the caller has not necessarily
        // chosen one yet at quote time.
        return mailbox.quoteDispatch(destinationChain, bytes32(0), payload, _hookMetadata(destinationChain, payload));
    }

    /// @inheritdoc IBridgeAdapter
    function supportsChain(uint32 chainId) external view returns (bool) {
        return supportedDomains[chainId];
    }

    /// @inheritdoc IBridgeAdapter
    function bridgeName() external pure returns (string memory) {
        return "Hyperlane";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GAS ESTIMATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Destination gas limit this adapter will request for a given payload
    /// @dev Exposed for callers and tests that need to reason about the quote without paying.
    /// @param destinationChain Hyperlane domain ID of the destination
    /// @param payload Encoded message data
    /// @return Destination gas limit
    function gasLimitFor(uint32 destinationChain, bytes calldata payload) external view returns (uint256) {
        return _gasLimit(destinationChain, payload);
    }

    /// @notice Number of registry entries a payload will write on the destination
    /// @dev Wallet messages write exactly one entry. Transaction batches carry an explicit
    ///      `transactionCount` in the seventh head slot of the ABI encoding (version, msgType,
    ///      dataHash, reporter, reportedChainId, sourceChainId, transactionCount, ...), which is
    ///      cheaper to read directly than decoding the two dynamic arrays that follow.
    ///      An unrecognised payload is treated as a single entry so that a future message type
    ///      degrades to the previous flat quote rather than reverting the send.
    /// @param payload Encoded message data
    /// @return count Entry count used for gas scaling
    function entryCount(bytes calldata payload) public pure returns (uint256 count) {
        // version (32) + msgType (32) — anything shorter is not one of our messages.
        if (payload.length < 64) return 1;

        // Read the raw byte rather than abi.decode(..., (bytes1)): strict decoding reverts unless
        // the other 31 bytes of the word are zero, and this function is called on every payload,
        // including soulbound mint requests whose second word is a non-zero address.
        bytes1 msgType = payload[32];

        if (msgType == CrossChainMessage.MSG_TYPE_TRANSACTION_BATCH) {
            // transactionCount occupies head slot 6 (0-indexed): bytes [192:224].
            if (payload.length < 224) return 1;
            // Read as a full word for the same reason. A nonsense value cannot produce a nonsense
            // quote — _gasLimit bounds the result by MAX_GAS_LIMIT.
            return uint256(bytes32(payload[192:224]));
        }

        return 1;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Add or remove a supported destination domain
    /// @dev Enabling a domain is timelocked after setup (it widens where this adapter can
    ///      dispatch); disabling stays immediate so a compromised destination can be cut off.
    /// @param domain Hyperlane domain ID
    /// @param supported True to enable, false to disable
    function setDomainSupport(uint32 domain, bool supported) external onlyOwner {
        if (supported && setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        _setDomainSupport(domain, supported);
    }

    /// @notice Propose enabling a destination domain (2-day delay before activation)
    /// @param domain Hyperlane domain ID to enable
    function proposeDomainSupport(uint32 domain) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setDomainSupport", domain)));
    }

    /// @notice Activate a previously proposed domain enablement
    /// @param domain Hyperlane domain ID to enable
    function activateDomainSupport(uint32 domain) external onlyOwner {
        _activateAction(keccak256(abi.encode("setDomainSupport", domain)));
        _setDomainSupport(domain, true);
    }

    /// @notice Add or remove a contract permitted to dispatch messages through this adapter
    /// @dev THE trust boundary of this contract. The destination's CrossChainInbox and
    ///      SoulboundReceiver accept anything this adapter dispatches, so granting dispatch
    ///      rights post-setup requires propose → 2 days → activate. Revoking is immediate:
    ///      it only ever narrows what can be sent, and is the emergency response to a
    ///      compromised spoke contract.
    /// @param sender Address to authorize (SpokeRegistry, SpokeSoulboundForwarder)
    /// @param authorized True to enable, false to revoke
    function setAuthorizedSender(address sender, bool authorized) external onlyOwner {
        if (sender == address(0)) revert HyperlaneAdapter__ZeroAddress();
        if (authorized && setupComplete) revert TimelockOwnable__SetupAlreadyComplete();
        _setAuthorizedSender(sender, authorized);
    }

    /// @notice Propose authorizing a dispatcher (2-day delay before activation)
    /// @param sender Address to authorize
    function proposeAuthorizedSender(address sender) external onlyOwner {
        if (sender == address(0)) revert HyperlaneAdapter__ZeroAddress();
        _proposeAction(keccak256(abi.encode("setAuthorizedSender", sender)));
    }

    /// @notice Activate a previously proposed dispatcher authorization
    /// @param sender Address to authorize
    function activateAuthorizedSender(address sender) external onlyOwner {
        _activateAction(keccak256(abi.encode("setAuthorizedSender", sender)));
        _setAuthorizedSender(sender, true);
    }

    /// @notice Set the destination gas model for a domain
    /// @dev NOT timelocked: this only affects how much destination gas is purchased, and it is
    ///      the operational lever for responding to a destination gas-schedule change. It cannot
    ///      authorize a sender or widen what may be dispatched. The effective (post-default)
    ///      values are validated so a maximum-size batch stays quotable under MAX_GAS_LIMIT —
    ///      without this, a plausible perEntryGas bump would make every large batch revert on
    ///      quoteMessage, stranding already-acknowledged batches whose reporters burned a nonce.
    /// @param domain Hyperlane domain ID
    /// @param baseGas Fixed gas amount (0 = use DEFAULT_BASE_GAS)
    /// @param perEntryGas Per-entry gas amount (0 = use DEFAULT_PER_ENTRY_GAS)
    function setGasAmounts(uint32 domain, uint256 baseGas, uint256 perEntryGas) external onlyOwner {
        uint256 effectiveBase = baseGas == 0 ? DEFAULT_BASE_GAS : baseGas;
        uint256 effectivePerEntry = perEntryGas == 0 ? DEFAULT_PER_ENTRY_GAS : perEntryGas;
        if (effectiveBase + effectivePerEntry * BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE > MAX_GAS_LIMIT) {
            revert HyperlaneAdapter__GasConfigExceedsLimit();
        }
        baseGasAmounts[domain] = baseGas;
        perEntryGasAmounts[domain] = perEntryGas;
        emit GasAmountUpdated(domain, baseGas, perEntryGas);
    }

    /// @notice Batch add supported domains
    /// @dev Setup-only convenience. After completeSetup(), enable domains one at a time through
    ///      proposeDomainSupport/activateDomainSupport so each addition carries its own delay.
    /// @param domains Array of Hyperlane domain IDs to enable (max 100)
    function addDomains(uint32[] calldata domains) external onlyOwner onlyDuringSetup {
        if (domains.length > 100) revert HyperlaneAdapter__TooManyDomains();
        for (uint256 i = 0; i < domains.length; i++) {
            _setDomainSupport(domains[i], true);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Destination gas limit = base + perEntry × entries, bounded by MAX_GAS_LIMIT.
    function _gasLimit(uint32 destinationChain, bytes calldata payload) internal view returns (uint256) {
        uint256 baseGas = baseGasAmounts[destinationChain];
        if (baseGas == 0) baseGas = DEFAULT_BASE_GAS;

        uint256 perEntryGas = perEntryGasAmounts[destinationChain];
        if (perEntryGas == 0) perEntryGas = DEFAULT_PER_ENTRY_GAS;

        // Bound the count before multiplying: a fabricated entry count near 2^256 would otherwise
        // revert on arithmetic overflow rather than with a diagnosable error.
        uint256 count = entryCount(payload);
        if (count > MAX_GAS_LIMIT / perEntryGas) revert HyperlaneAdapter__GasLimitExceeded();

        uint256 gasLimit = baseGas + (perEntryGas * count);
        if (gasLimit > MAX_GAS_LIMIT) revert HyperlaneAdapter__GasLimitExceeded();

        return gasLimit;
    }

    /// @dev StandardHookMetadata carrying the destination gas limit for the IGP hook.
    ///      `msgValue` is zero — we never forward native value to the recipient.
    function _hookMetadata(uint32 destinationChain, bytes calldata payload) internal view returns (bytes memory) {
        return StandardHookMetadata.formatMetadata(0, _gasLimit(destinationChain, payload), msg.sender, "");
    }

    function _setDomainSupport(uint32 domain, bool supported) internal {
        supportedDomains[domain] = supported;
        emit DomainSupportUpdated(domain, supported);
    }

    function _setAuthorizedSender(address sender, bool authorized) internal {
        authorizedSenders[sender] = authorized;
        emit AuthorizedSenderUpdated(sender, authorized);
    }
}
