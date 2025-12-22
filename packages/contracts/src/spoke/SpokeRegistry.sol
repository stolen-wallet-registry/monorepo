// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ISpokeRegistry } from "../interfaces/ISpokeRegistry.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";

/// @title SpokeRegistry
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain registration contract for cross-chain stolen wallet registry
/// @dev Implements full two-phase EIP-712 registration locally, then sends to hub via bridge.
///      Uses same signature flow as StolenWalletRegistry for consistency.
contract SpokeRegistry is ISpokeRegistry, EIP712, Ownable2Step {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;

    // ═══════════════════════════════════════════════════════════════════════════
    // TYPE HASHES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev EIP-712 type hash for acknowledgement phase
    /// @dev Same as StolenWalletRegistry for signature compatibility
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    /// @dev EIP-712 type hash for registration phase
    bytes32 private constant REGISTRATION_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice This spoke chain's EIP-155 chain ID
    uint32 public immutable spokeChainId;

    /// @notice Bridge adapter for cross-chain messaging
    address public immutable bridgeAdapter;

    /// @notice Fee manager for registration fees (address(0) = free)
    address public immutable feeManager;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub chain Hyperlane domain ID
    uint32 public hubChainId;

    /// @notice CrossChainInbox address on hub (bytes32 for cross-chain addressing)
    bytes32 public hubInbox;

    /// @notice Pending acknowledgements - temporary, deleted after registration
    mapping(address => PendingAcknowledgement) private pendingAcknowledgements;

    /// @notice Nonces for replay protection
    mapping(address => uint256) public nonces;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when hub configuration is updated
    event HubConfigUpdated(uint32 indexed hubChainId, bytes32 hubInbox);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when hub is not configured
    error SpokeRegistry__HubNotConfigured();

    /// @notice Thrown when refund fails
    error SpokeRegistry__RefundFailed();

    /// @notice Thrown when withdrawal fails
    error SpokeRegistry__WithdrawalFailed();

    /// @notice Thrown when a zero address is provided for a required parameter
    error SpokeRegistry__ZeroAddress();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @param _owner Contract owner
    /// @param _bridgeAdapter Bridge adapter address for cross-chain messaging
    /// @param _feeManager Fee manager address (address(0) for free registrations)
    /// @param _hubChainId Hub chain Hyperlane domain ID
    /// @param _hubInbox CrossChainInbox address on hub
    constructor(address _owner, address _bridgeAdapter, address _feeManager, uint32 _hubChainId, bytes32 _hubInbox)
        EIP712("StolenWalletRegistry", "4")
        Ownable(_owner)
    {
        if (_bridgeAdapter == address(0)) revert SpokeRegistry__ZeroAddress();
        spokeChainId = uint32(block.chainid);
        bridgeAdapter = _bridgeAdapter;
        feeManager = _feeManager;
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeRegistry
    function acknowledgeLocal(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s)
        external
        payable
    {
        // Fail fast: reject zero address
        if (owner == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[owner]) revert SpokeRegistry__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ACKNOWLEDGEMENT_TYPEHASH, owner, msg.sender, nonce, deadline)));
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert SpokeRegistry__InvalidSigner();

        // Increment nonce AFTER validation to prevent replay
        nonces[owner]++;

        // Store acknowledgement with randomized grace period timing
        pendingAcknowledgements[owner] = PendingAcknowledgement({
            trustedForwarder: msg.sender,
            startBlock: TimingConfig.getGracePeriodEndBlock(),
            expiryBlock: TimingConfig.getDeadlineBlock()
        });

        emit AcknowledgementReceived(owner, msg.sender, owner != msg.sender);
    }

    /// @inheritdoc ISpokeRegistry
    function registerLocal(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s)
        external
        payable
    {
        // Fail fast: reject zero address
        if (owner == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[owner]) revert SpokeRegistry__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(REGISTRATION_TYPEHASH, owner, msg.sender, nonce, deadline)));
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert SpokeRegistry__InvalidSigner();

        // Load and validate acknowledgement exists with matching forwarder
        PendingAcknowledgement memory ack = pendingAcknowledgements[owner];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();

        // Check grace period has started
        if (block.number < ack.startBlock) revert SpokeRegistry__GracePeriodNotStarted();

        // Check registration window hasn't expired
        if (block.number >= ack.expiryBlock) revert SpokeRegistry__ForwarderExpired();

        // Determine sponsorship (isSponsored is the only on-chain enforceable property)
        bool isSponsored = owner != msg.sender;

        // Build cross-chain payload
        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.RegistrationPayload({
            wallet: owner,
            sourceChainId: spokeChainId,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: uint64(block.timestamp),
            registrationHash: digest
        });

        bytes memory encodedPayload = payload.encodeRegistration();

        // Quote bridge fee
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);

        // Quote registration fee (if fee manager is configured)
        uint256 registrationFee = 0;
        if (feeManager != address(0)) {
            registrationFee = IFeeManager(feeManager).currentFeeWei();
        }

        uint256 totalRequired = bridgeFee + registrationFee;
        if (msg.value < totalRequired) revert SpokeRegistry__InsufficientFee();

        // Increment nonce AFTER validation
        nonces[owner]++;

        // Clean up acknowledgement
        delete pendingAcknowledgements[owner];

        // Send cross-chain message
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit RegistrationSentToHub(owner, messageId, hubChainId);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeRegistry__RefundFailed();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeRegistry
    function isPending(address wallet) external view returns (bool) {
        PendingAcknowledgement memory ack = pendingAcknowledgements[wallet];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getAcknowledgement(address wallet) external view returns (PendingAcknowledgement memory data) {
        return pendingAcknowledgements[wallet];
    }

    /// @inheritdoc ISpokeRegistry
    function quoteRegistration(address owner) external view returns (uint256) {
        // Build a dummy payload to get accurate quote
        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.RegistrationPayload({
            wallet: owner,
            sourceChainId: spokeChainId,
            isSponsored: false,
            nonce: nonces[owner],
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory encodedPayload = payload.encodeRegistration();

        // Quote bridge fee
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);

        // Quote registration fee
        uint256 registrationFee = 0;
        if (feeManager != address(0)) {
            registrationFee = IFeeManager(feeManager).currentFeeWei();
        }

        return bridgeFee + registrationFee;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update hub chain configuration
    /// @param _hubChainId Hub chain Hyperlane domain ID
    /// @param _hubInbox CrossChainInbox address on hub
    function setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        emit HubConfigUpdated(_hubChainId, _hubInbox);
    }

    /// @notice Withdraw accumulated fees to treasury
    /// @param to Treasury address
    /// @param amount Amount to withdraw
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert SpokeRegistry__ZeroAddress();
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert SpokeRegistry__WithdrawalFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE ETH
    // ═══════════════════════════════════════════════════════════════════════════

    receive() external payable { }
}
