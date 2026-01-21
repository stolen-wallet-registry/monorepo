// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { IStolenWalletRegistry } from "../interfaces/IStolenWalletRegistry.sol";
import { IOperatorRegistry } from "../interfaces/IOperatorRegistry.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { MerkleRootComputation } from "../libraries/MerkleRootComputation.sol";
import { RegistryCapabilities } from "../libraries/RegistryCapabilities.sol";

/// @title StolenWalletRegistry
/// @author Stolen Wallet Registry Team
/// @notice Registry for stolen wallets with two-phase registration
/// @dev Implements IStolenWalletRegistry with EIP-712 signature verification.
///      Two-phase registration prevents single-transaction phishing attacks:
///      1. Acknowledgement: Owner signs intent, establishes trusted forwarder
///      2. Grace period: Randomized delay (1-4 minutes)
///      3. Registration: Owner signs again, wallet marked as stolen permanently
///
///      Operators (DAO-approved) can bypass two-phase via single-phase batch registration.
contract StolenWalletRegistry is IStolenWalletRegistry, EIP712, Ownable2Step {
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
    // OPERATOR BATCH STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Capability bit required for wallet registry operators (from shared library)
    uint8 private constant WALLET_REGISTRY_CAPABILITY = RegistryCapabilities.WALLET_REGISTRY;

    /// @notice Operator registry for permission checks
    address public operatorRegistry;

    /// @notice Operator wallet batches: batchId => WalletBatch
    mapping(bytes32 => WalletBatch) private _walletBatches;

    /// @notice Invalidated wallet entries: entryHash => invalidated
    mapping(bytes32 => bool) private _invalidatedWalletEntries;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the registry with EIP-712 domain separator and fee configuration
    /// @dev Version "4" for frontend compatibility with existing signatures
    /// @param _owner Initial owner address (typically DAO multisig)
    /// @param _feeManager FeeManager contract address (address(0) for free registrations)
    /// @param _registryHub RegistryHub contract address for fee forwarding
    /// @param _graceBlocks Base blocks for grace period (chain-specific, see TimingConfig.sol)
    /// @param _deadlineBlocks Base blocks for deadline window (chain-specific, see TimingConfig.sol)
    constructor(
        address _owner,
        address _feeManager,
        address _registryHub,
        uint256 _graceBlocks,
        uint256 _deadlineBlocks
    ) EIP712("StolenWalletRegistry", "4") Ownable(_owner) {
        // Validate fee configuration consistency:
        // If feeManager is set, registryHub must also be set to forward fees.
        // Otherwise, register() could accept fees that can never be forwarded.
        // Note: feeManager=0 with registryHub!=0 is valid (free registrations with hub).
        if (_feeManager != address(0) && _registryHub == address(0)) {
            revert InvalidFeeConfig();
        }

        // Validate timing parameters to prevent misconfiguration.
        // Both grace period and deadline use randomization in TimingConfig.sol:
        //   - Grace end:   block.number + random(0, graceBlocks) + graceBlocks
        //                  Range: [current + graceBlocks, current + 2*graceBlocks - 1]
        //   - Deadline:    block.number + random(0, deadlineBlocks) + deadlineBlocks
        //                  Range: [current + deadlineBlocks, current + 2*deadlineBlocks - 1]
        //
        // Worst case: grace period ends at maximum (2*graceBlocks - 1), deadline at minimum (deadlineBlocks)
        // To ensure deadline always > grace end: deadlineBlocks > 2*graceBlocks - 1
        // Simplified: deadlineBlocks >= 2*graceBlocks
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks) {
            revert InvalidTimingConfig();
        }

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
    // OPERATOR BATCH FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenWalletRegistry
    function registerBatchAsOperator(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address[] calldata walletAddresses,
        bytes32[] calldata chainIds
    ) external payable {
        // Check operator approval
        if (
            operatorRegistry == address(0)
                || !IOperatorRegistry(operatorRegistry).isApprovedFor(msg.sender, WALLET_REGISTRY_CAPABILITY)
        ) {
            revert StolenWalletRegistry__NotApprovedOperator();
        }

        // Validate inputs
        if (merkleRoot == bytes32(0)) revert StolenWalletRegistry__InvalidMerkleRoot();
        if (reportedChainId == bytes32(0)) revert InvalidChainId();
        if (walletAddresses.length == 0) revert StolenWalletRegistry__InvalidWalletCount();
        if (walletAddresses.length != chainIds.length) revert StolenWalletRegistry__ArrayLengthMismatch();

        // Validate each entry - reject zero addresses and zero chainIds
        for (uint256 i = 0; i < walletAddresses.length; i++) {
            if (walletAddresses[i] == address(0)) revert StolenWalletRegistry__InvalidWalletAddress();
            if (chainIds[i] == bytes32(0)) revert StolenWalletRegistry__InvalidChainIdEntry();
        }

        // Verify merkle root matches provided data
        bytes32 computedRoot = _computeWalletMerkleRoot(walletAddresses, chainIds);
        if (computedRoot != merkleRoot) revert StolenWalletRegistry__MerkleRootMismatch();

        // Compute batch ID
        bytes32 batchId = _computeWalletBatchId(merkleRoot, msg.sender, reportedChainId);

        // Check not already registered
        if (_walletBatches[batchId].registeredAt != 0) revert StolenWalletRegistry__BatchAlreadyRegistered();

        // Validate operator batch fee
        if (feeManager != address(0)) {
            uint256 requiredFee = IFeeManager(feeManager).operatorBatchFeeWei();
            if (msg.value < requiredFee) revert InsufficientFee();
        }

        // Store batch
        _walletBatches[batchId] = WalletBatch({
            merkleRoot: merkleRoot,
            operator: msg.sender,
            reportedChainId: reportedChainId,
            registeredAt: uint64(block.number),
            walletCount: uint32(walletAddresses.length),
            invalidated: false
        });

        emit WalletBatchRegistered(
            batchId, merkleRoot, msg.sender, reportedChainId, uint32(walletAddresses.length), walletAddresses, chainIds
        );

        // Forward fee to RegistryHub
        if (registryHub != address(0) && msg.value > 0) {
            (bool success,) = registryHub.call{ value: msg.value }("");
            if (!success) revert FeeForwardFailed();
        }
    }

    /// @inheritdoc IStolenWalletRegistry
    function setOperatorRegistry(address _operatorRegistry) external onlyOwner {
        operatorRegistry = _operatorRegistry;
        emit OperatorRegistrySet(_operatorRegistry);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALIDATION FUNCTIONS (DAO only)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenWalletRegistry
    function invalidateWalletBatch(bytes32 batchId) external onlyOwner {
        WalletBatch storage batch = _walletBatches[batchId];
        if (batch.registeredAt == 0) revert StolenWalletRegistry__BatchNotFound();
        if (batch.invalidated) revert StolenWalletRegistry__AlreadyInvalidated();

        batch.invalidated = true;
        emit WalletBatchInvalidated(batchId, msg.sender);
    }

    /// @inheritdoc IStolenWalletRegistry
    function invalidateWalletEntry(bytes32 entryHash) external onlyOwner {
        if (_invalidatedWalletEntries[entryHash]) revert StolenWalletRegistry__AlreadyInvalidated();

        _invalidatedWalletEntries[entryHash] = true;
        emit WalletEntryInvalidated(entryHash, msg.sender);
    }

    /// @inheritdoc IStolenWalletRegistry
    function reinstateWalletEntry(bytes32 entryHash) external onlyOwner {
        if (!_invalidatedWalletEntries[entryHash]) revert StolenWalletRegistry__EntryNotInvalidated();

        _invalidatedWalletEntries[entryHash] = false;
        emit WalletEntryReinstated(entryHash, msg.sender);
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

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Operator Batch
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IStolenWalletRegistry
    function isWalletBatchRegistered(bytes32 batchId) external view returns (bool) {
        WalletBatch memory batch = _walletBatches[batchId];
        return batch.registeredAt != 0 && !batch.invalidated;
    }

    /// @inheritdoc IStolenWalletRegistry
    function getWalletBatch(bytes32 batchId) external view returns (WalletBatch memory) {
        return _walletBatches[batchId];
    }

    /// @inheritdoc IStolenWalletRegistry
    function verifyWalletInBatch(address wallet, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool)
    {
        WalletBatch memory batch = _walletBatches[batchId];
        if (batch.registeredAt == 0 || batch.invalidated) return false;

        bytes32 entryHash = _computeWalletEntryHash(wallet, chainId);
        if (_invalidatedWalletEntries[entryHash]) return false;

        bytes32 leaf = keccak256(abi.encodePacked(wallet, chainId));
        return MerkleProof.verify(merkleProof, batch.merkleRoot, leaf);
    }

    /// @inheritdoc IStolenWalletRegistry
    function isWalletEntryInvalidated(bytes32 entryHash) external view returns (bool) {
        return _invalidatedWalletEntries[entryHash];
    }

    /// @inheritdoc IStolenWalletRegistry
    function computeWalletBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        external
        pure
        returns (bytes32)
    {
        return _computeWalletBatchId(merkleRoot, operator, reportedChainId);
    }

    /// @inheritdoc IStolenWalletRegistry
    function computeWalletEntryHash(address wallet, bytes32 chainId) external pure returns (bytes32) {
        return _computeWalletEntryHash(wallet, chainId);
    }

    /// @inheritdoc IStolenWalletRegistry
    function quoteOperatorBatchRegistration() external view returns (uint256) {
        if (feeManager == address(0)) return 0;
        return IFeeManager(feeManager).operatorBatchFeeWei();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS - Registry-Specific Merkle Functions
    // ═══════════════════════════════════════════════════════════════════════════
    // These functions are intentionally per-registry because:
    // - Batch IDs: Include registry-specific identifiers (merkleRoot + operator + chainId)
    // - Entry hashes (leaves): Use registry-specific types (address for wallets, bytes32 for txs)
    // - The MerkleRootComputation library handles the tree-building algorithm only
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute batch ID from parameters
    /// @dev Registry-specific: includes reportedChainId for batch uniqueness across chains
    function _computeWalletBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(merkleRoot, operator, reportedChainId));
    }

    /// @notice Compute entry hash (Merkle leaf) for a wallet
    /// @dev Registry-specific: uses address type for wallet entries
    function _computeWalletEntryHash(address wallet, bytes32 chainId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(wallet, chainId));
    }

    /// @notice Compute Merkle root from wallet addresses and chain IDs
    /// @dev Registry-specific leaf construction (address + chainId), then delegates
    ///      to MerkleRootComputation library for tree building with OZ compatibility
    function _computeWalletMerkleRoot(address[] calldata wallets, bytes32[] calldata walletChainIds)
        internal
        pure
        returns (bytes32)
    {
        uint256 length = wallets.length;
        if (length == 0) return bytes32(0);

        // Build leaves: keccak256(abi.encodePacked(wallet, chainId))
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = keccak256(abi.encodePacked(wallets[i], walletChainIds[i]));
        }

        return MerkleRootComputation.computeRoot(leaves);
    }
}
