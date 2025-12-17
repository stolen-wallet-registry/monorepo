// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IStolenWalletRegistry } from "../interfaces/IStolenWalletRegistry.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";

/// @title StolenWalletRegistry
/// @author Stolen Wallet Registry Team
/// @notice Registry for stolen wallets with two-phase registration
/// @dev Implements IStolenWalletRegistry with EIP-712 signature verification.
///      Two-phase registration prevents single-transaction phishing attacks:
///      1. Acknowledgement: Owner signs intent, establishes trusted forwarder
///      2. Grace period: Randomized delay (1-4 minutes)
///      3. Registration: Owner signs again, wallet marked as stolen permanently
contract StolenWalletRegistry is IStolenWalletRegistry, EIP712 {
    // ═══════════════════════════════════════════════════════════════════════════
    // TYPE HASHES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev EIP-712 type hash for acknowledgement phase
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    /// @dev EIP-712 type hash for registration phase
    bytes32 private constant REGISTRATION_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Completed registrations - persists permanently after registration
    mapping(address => RegistrationData) private registeredWallets;

    /// @notice Pending acknowledgements - temporary, deleted after registration
    mapping(address => AcknowledgementData) private pendingAcknowledgements;

    /// @notice Nonces for replay protection - increments on both ACK and REG
    mapping(address => uint256) public nonces;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the registry with EIP-712 domain separator
    /// @dev Version "4" for frontend compatibility with existing signatures
    constructor() EIP712("StolenWalletRegistry", "4") { }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenWalletRegistry
    function acknowledge(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s)
        external
        payable
    {
        // Fail fast: reject zero address
        if (owner == address(0)) revert InvalidOwner();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert Acknowledgement__Expired();

        // Validate nonce matches expected value
        if (nonce != nonces[owner]) revert InvalidNonce();

        // Prevent re-registration of already registered wallets
        if (registeredWallets[owner].registeredAt != 0) revert AlreadyRegistered();

        // Verify EIP-712 signature
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(ACKNOWLEDGEMENT_TYPEHASH, owner, msg.sender, nonce, deadline)));
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert Acknowledgement__InvalidSigner();

        // Increment nonce AFTER validation to prevent replay
        nonces[owner]++;

        // Store acknowledgement with randomized grace period timing
        pendingAcknowledgements[owner] = AcknowledgementData({
            trustedForwarder: msg.sender,
            startBlock: TimingConfig.getGracePeriodEndBlock(),
            expiryBlock: TimingConfig.getDeadlineBlock()
        });

        emit WalletAcknowledged(owner, msg.sender, owner != msg.sender);
    }

    /// @inheritdoc IStolenWalletRegistry
    function register(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external payable {
        // Fail fast: reject zero address
        if (owner == address(0)) revert InvalidOwner();

        // Validate signature deadline hasn't passed
        if (deadline <= block.timestamp) revert Registration__SignatureExpired();

        // Validate nonce matches expected value
        if (nonce != nonces[owner]) revert InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(REGISTRATION_TYPEHASH, owner, msg.sender, nonce, deadline)));
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != owner) revert Registration__InvalidSigner();

        // Load and validate acknowledgement exists with matching forwarder
        AcknowledgementData memory ack = pendingAcknowledgements[owner];
        if (ack.trustedForwarder != msg.sender) revert Registration__InvalidForwarder();

        // Check grace period has started (prevents immediate registration)
        if (block.number < ack.startBlock) revert Registration__GracePeriodNotStarted();

        // Check registration window hasn't expired
        // Note: Expired entries are NOT deleted here because revert rolls back state changes.
        // The isPending() view function correctly returns false for expired entries.
        // Expired entries are overwritten when a new acknowledgement is made.
        if (block.number >= ack.expiryBlock) revert Registration__ForwarderExpired();

        // Increment nonce AFTER validation (fixes bug from original contract)
        nonces[owner]++;

        // Clean up acknowledgement - no longer needed
        delete pendingAcknowledgements[owner];

        // Persist registration permanently
        bool isSponsored = owner != msg.sender;
        registeredWallets[owner] =
            RegistrationData({ registeredAt: block.number, registeredBy: msg.sender, isSponsored: isSponsored });

        emit WalletRegistered(owner, isSponsored);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Primary Query Interface
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenWalletRegistry
    function isRegistered(address wallet) external view returns (bool) {
        return registeredWallets[wallet].registeredAt != 0;
    }

    /// @inheritdoc IStolenWalletRegistry
    function isPending(address wallet) external view returns (bool) {
        AcknowledgementData memory ack = pendingAcknowledgements[wallet];
        // Has pending acknowledgement AND not yet expired
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc IStolenWalletRegistry
    function getRegistration(address wallet) external view returns (RegistrationData memory) {
        return registeredWallets[wallet];
    }

    /// @inheritdoc IStolenWalletRegistry
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory) {
        return pendingAcknowledgements[wallet];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Frontend Compatibility
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenWalletRegistry
    function generateHashStruct(address forwarder, uint8 step)
        external
        view
        returns (uint256 deadline, bytes32 hashStruct)
    {
        deadline = TimingConfig.getSignatureDeadline();
        bytes32 typehash = step == 1 ? ACKNOWLEDGEMENT_TYPEHASH : REGISTRATION_TYPEHASH;
        hashStruct = keccak256(abi.encode(typehash, msg.sender, forwarder, nonces[msg.sender], deadline));
    }

    /// @inheritdoc IStolenWalletRegistry
    function getDeadlines(address session)
        external
        view
        returns (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        )
    {
        // Preserved exactly as original for frontend compatibility
        AcknowledgementData memory ack = pendingAcknowledgements[session];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;

        if (ack.expiryBlock <= block.number) {
            isExpired = true;
            timeLeft = 0;
            graceStartsAt = 0;
        } else {
            isExpired = false;
            timeLeft = ack.expiryBlock - block.number;
            graceStartsAt = ack.startBlock > block.number ? ack.startBlock - block.number : 0;
        }
    }
}
