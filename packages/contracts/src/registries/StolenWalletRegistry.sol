// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IStolenWalletRegistry } from "../interfaces/IStolenWalletRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
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
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fee manager address (address(0) = free registrations)
    address public immutable feeManager;

    /// @notice Registry hub address for fee forwarding
    address public immutable registryHub;

    /// @notice Base blocks for grace period (chain-specific for consistent UX)
    /// @dev Grace period = graceBlocks + random(0, graceBlocks). See TimingConfig.sol.
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for registration deadline (chain-specific for consistent UX)
    /// @dev Deadline = deadlineBlocks + random(0, deadlineBlocks). See TimingConfig.sol.
    uint256 public immutable deadlineBlocks;

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

    /// @notice Initialize the registry with EIP-712 domain separator and fee configuration
    /// @dev Version "4" for frontend compatibility with existing signatures
    /// @param _feeManager FeeManager contract address (address(0) for free registrations)
    /// @param _registryHub RegistryHub contract address for fee forwarding
    /// @param _graceBlocks Base blocks for grace period (chain-specific, see TimingConfig.sol)
    /// @param _deadlineBlocks Base blocks for deadline window (chain-specific, see TimingConfig.sol)
    constructor(address _feeManager, address _registryHub, uint256 _graceBlocks, uint256 _deadlineBlocks)
        EIP712("StolenWalletRegistry", "4")
    {
        // Validate timing parameters to prevent misconfiguration
        // deadlineBlocks must be > graceBlocks because both use randomization:
        // if equal, deadline could end before grace period due to random offsets
        require(_graceBlocks > 0, "graceBlocks must be positive");
        require(_deadlineBlocks > 0, "deadlineBlocks must be positive");
        require(_deadlineBlocks > _graceBlocks, "deadline must be > grace");

        feeManager = _feeManager;
        registryHub = _registryHub;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
    }

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
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
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

        // Validate fee payment (if fee manager is configured)
        if (feeManager != address(0)) {
            uint256 requiredFee = IFeeManager(feeManager).currentFeeWei();
            if (msg.value < requiredFee) revert InsufficientFee();
        }

        // State changes (CEI: effects before interactions)
        nonces[owner]++;
        delete pendingAcknowledgements[owner];

        bool isSponsored = owner != msg.sender;

        // Validate chain ID fits in uint32 (all current EVM chains do, but defensive)
        require(block.chainid <= type(uint32).max, "chain id too large");

        registeredWallets[owner] = RegistrationData({
            registeredAt: uint64(block.number),
            sourceChainId: uint32(block.chainid),
            bridgeId: uint8(BridgeId.NONE),
            isSponsored: isSponsored,
            crossChainMessageId: bytes32(0)
        });

        emit WalletRegistered(owner, isSponsored);

        // Forward fee to RegistryHub (external call last)
        if (registryHub != address(0) && msg.value > 0) {
            (bool success,) = registryHub.call{ value: msg.value }("");
            if (!success) revert FeeForwardFailed();
        }
    }

    /// @inheritdoc IStolenWalletRegistry
    function registerFromHub(
        address wallet,
        uint32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external {
        // Only RegistryHub can call this function
        if (msg.sender != registryHub) revert UnauthorizedCaller();

        // Validate wallet address
        if (wallet == address(0)) revert InvalidOwner();

        // Validate source chain ID (cross-chain registrations must have valid chain ID)
        if (sourceChainId == 0) revert InvalidChainId();

        // Validate bridge ID (must be a valid BridgeId enum value: 0-3)
        if (bridgeId > uint8(BridgeId.WORMHOLE)) revert InvalidBridgeId();

        // Prevent re-registration
        if (registeredWallets[wallet].registeredAt != 0) revert AlreadyRegistered();

        // Store the cross-chain registration
        registeredWallets[wallet] = RegistrationData({
            registeredAt: uint64(block.number),
            sourceChainId: sourceChainId,
            bridgeId: bridgeId,
            isSponsored: isSponsored,
            crossChainMessageId: crossChainMessageId
        });

        emit WalletRegistered(wallet, isSponsored);
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

    /// @inheritdoc IStolenWalletRegistry
    /// @notice Returns the registration fee for a wallet.
    /// @dev The wallet parameter is unused on hub chain but required for interface
    ///      compatibility with SpokeRegistry where fees may vary per-wallet (due to
    ///      nonce-dependent message size affecting bridge costs).
    function quoteRegistration(
        address /* wallet - unused on hub, required for spoke interface */
    )
        external
        view
        returns (uint256)
    {
        // On hub chain, only registration fee applies (no bridge fee)
        if (feeManager == address(0)) {
            return 0;
        }
        return IFeeManager(feeManager).currentFeeWei();
    }
}
