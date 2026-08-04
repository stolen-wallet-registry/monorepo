// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { TimelockOwnable } from "../libraries/TimelockOwnable.sol";
import { ISpokeRegistry } from "../interfaces/ISpokeRegistry.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { IFeeManager } from "../interfaces/IFeeManager.sol";
import { TimingConfig } from "../libraries/TimingConfig.sol";
import { CAIP10 } from "../libraries/CAIP10.sol";
import { CAIP10Evm } from "../libraries/CAIP10Evm.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";
import { EIP712Constants } from "../libraries/EIP712Constants.sol";
import { BatchLimits } from "../libraries/BatchLimits.sol";

/// @title SpokeRegistry
/// @author Stolen Wallet Registry Team
/// @notice Spoke chain registration contract for cross-chain stolen wallet registry
/// @dev Includes incidentTimestamp and reportedChainId in user signatures.
///      Sends messages to FraudRegistryHub on hub chain via bridge adapter.
///
///      Owner powers are timelocked (TimelockOwnable): `hubInbox` is where every registration
///      this contract accepts ultimately lands, so repointing it in one transaction would
///      silently divert users' paid registrations. Post-setup it requires propose → 2 days →
///      activate, matching the hub-side registries.
contract SpokeRegistry is ISpokeRegistry, EIP712, TimelockOwnable {
    using CrossChainMessage for CrossChainMessage.WalletRegistrationPayload;
    using CrossChainMessage for CrossChainMessage.TransactionBatchPayload;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Largest transaction batch that may be acknowledged for cross-chain registration
    /// @dev Bounded by what the hub can execute in a single destination transaction. At ~26,200 gas
    ///      per entry a 25M-gas block tops out near 950 entries; 800 leaves headroom for the fixed
    ///      cost of message delivery and ISM verification. Without a bound here the two-phase and
    ///      cross-chain paths accept a batch that is quotable but not executable on arrival — the
    ///      spoke consumes the nonce and the fee, and the registration strands.
    uint32 public constant MAX_CROSS_CHAIN_BATCH_SIZE = uint32(BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE);

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice This spoke chain's source chain ID as CAIP-2 hash
    bytes32 public immutable sourceChainId;

    /// @notice Bridge adapter for cross-chain messaging
    address public immutable bridgeAdapter;

    /// @notice Fee manager for registration fees (address(0) = free)
    address public immutable feeManager;

    /// @notice Base blocks for grace period
    uint256 public immutable graceBlocks;

    /// @notice Base blocks for registration deadline
    uint256 public immutable deadlineBlocks;

    /// @notice Bridge ID for message tagging (1 = Hyperlane, etc.)
    uint8 public immutable bridgeId;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub chain domain ID (Hyperlane domain)
    uint32 public hubChainId;

    /// @notice Hub inbox address (bytes32 for cross-chain addressing)
    bytes32 public hubInbox;

    /// @notice Pending wallet acknowledgements
    mapping(address => AcknowledgementData) private _pendingAcknowledgements;

    /// @notice Pending transaction batch acknowledgements
    mapping(address => TransactionAcknowledgementData) private _pendingTxAcknowledgements;

    /// @notice Wallet-flow nonces for replay protection
    /// @dev SEPARATE from {txNonces} on purpose, and it must stay that way. The two flows have
    ///      independent pending acknowledgements and independent two-phase windows, so a single
    ///      shared counter lets one flow move the other's nonce out from under an already-signed
    ///      registration: acknowledge a wallet, then acknowledge a transaction batch, and the
    ///      wallet registration signature — produced against the nonce read at ack time — no
    ///      longer validates. The acknowledgement gas is already spent and the user cannot
    ///      re-acknowledge until `expiryBlock`, so the registration is stranded, not merely
    ///      retryable. The hub avoids this structurally by putting the two flows on two
    ///      contracts (WalletRegistry.nonces vs TransactionRegistry.nonces); the spoke hosts
    ///      both, so it needs two mappings to match. Keeping this one named `nonces` also keeps
    ///      the hub and spoke wallet ABIs identical for the shared frontend code path.
    mapping(address => uint256) public nonces;

    /// @notice Transaction-batch-flow nonces for replay protection
    /// @dev The transaction-side counterpart to {nonces}; see the rationale there.
    mapping(address => uint256) public txNonces;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the spoke registry
    /// @param _owner Contract owner
    /// @param _bridgeAdapter Bridge adapter address
    /// @param _feeManager Fee manager address (address(0) for free registrations)
    /// @param _hubChainId Hub chain Hyperlane domain ID
    /// @param _hubInbox Hub inbox address
    /// @param _graceBlocks Base blocks for grace period
    /// @param _deadlineBlocks Base blocks for deadline window
    /// @param _bridgeId Bridge identifier (1 = Hyperlane, etc.)
    constructor(
        address _owner,
        address _bridgeAdapter,
        address _feeManager,
        uint32 _hubChainId,
        bytes32 _hubInbox,
        uint256 _graceBlocks,
        uint256 _deadlineBlocks,
        uint8 _bridgeId
    ) EIP712("StolenWalletRegistry", "4") Ownable(_owner) {
        if (_bridgeAdapter == address(0)) revert SpokeRegistry__ZeroAddress();

        // Validate timing: `deadlineBlocks >= 2 * graceBlocks + 1` so a usable registration block
        // exists for EVERY randomised draw. See {WalletRegistry} for the derivation — the `+ 1`
        // accounts for `resolveWindowBlockHash` requiring `startBlock <= windowBlock < block.number`,
        // which makes `startBlock + 1` the earliest block on which `register` can succeed.
        if (_graceBlocks == 0 || _deadlineBlocks == 0 || _deadlineBlocks < 2 * _graceBlocks + 1) {
            revert SpokeRegistry__InvalidTimingConfig();
        }

        // Validate hub config: must be both set or both zero
        bool hubChainIdSet = _hubChainId != 0;
        bool hubInboxSet = _hubInbox != bytes32(0);
        if (hubChainIdSet != hubInboxSet) {
            revert SpokeRegistry__InvalidHubConfig();
        }

        // Compute source chain ID as CAIP-2 hash
        // Note: block.chainid cast to uint64 is safe - all known chains fit in uint64
        sourceChainId = CAIP10Evm.caip2Hash(uint64(block.chainid));

        bridgeAdapter = _bridgeAdapter;
        feeManager = _feeManager;
        hubChainId = _hubChainId;
        hubInbox = _hubInbox;
        graceBlocks = _graceBlocks;
        deadlineBlocks = _deadlineBlocks;
        bridgeId = _bridgeId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeRegistry
    function acknowledge(
        address wallet,
        address trustedForwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Fail fast: reject zero address
        if (wallet == address(0)) revert SpokeRegistry__InvalidOwner();
        if (trustedForwarder == address(0)) revert SpokeRegistry__ZeroAddress();
        // Only the forwarder named in the signature may open the window — hub parity.
        // See {WalletRegistry.acknowledge} for why (timing grind + nonce-burn griefing).
        if (msg.sender != trustedForwarder) revert SpokeRegistry__InvalidForwarder();

        // Validate hub is configured. `register` already checks this; without the same check here
        // a user completes phase 1 on a spoke that can never deliver phase 2 — burning a nonce
        // and the acknowledgement gas, and only discovering it one grace period later.
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Accepted range lives in TimingConfig.isSignatureDeadlineValid; the inner branch
        // only picks which of the two user-facing errors to report.
        if (!TimingConfig.isSignatureDeadlineValid(deadline)) {
            if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();
            revert SpokeRegistry__DeadlineTooFarInFuture();
        }

        // 0 means "unknown" and is allowed; a future incident is not physically possible.
        // Mirrors the hub's check so the two phases cannot disagree about validity.
        if (incidentTimestamp > block.timestamp) revert SpokeRegistry__InvalidIncidentTimestamp();

        // Reject re-acknowledgement while a prior one is still live, matching
        // WalletRegistry.acknowledge on the hub. Overwriting would restart the grace period and
        // strand the registration signature the user produced against the first acknowledgement.
        // (There is deliberately no already-registered check: registrations live on the hub, so
        // the spoke has no local registry state to consult.)
        AcknowledgementData memory existing = _pendingAcknowledgements[wallet];
        if (existing.trustedForwarder != address(0) && block.number < existing.expiryBlock) {
            revert SpokeRegistry__AlreadyAcknowledged();
        }

        // Validate nonce matches expected value
        if (nonce != nonces[wallet]) revert SpokeRegistry__InvalidNonce();

        // Compute isSponsored early to reduce stack pressure at emit
        bool isSponsored = wallet != trustedForwarder;

        // Verify EIP-712 signature (scoped to free stack slots)
        {
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        EIP712Constants.WALLET_ACK_TYPEHASH,
                        EIP712Constants.ACK_STATEMENT_HASH,
                        wallet,
                        trustedForwarder,
                        reportedChainId,
                        incidentTimestamp,
                        nonce,
                        deadline
                    )
                )
            );
            address signer = ECDSA.recover(digest, v, r, s);
            if (signer == address(0) || signer != wallet) revert SpokeRegistry__InvalidSigner();
        }

        // Increment nonce AFTER validation
        nonces[wallet]++;

        // Convert uint64 reportedChainId to bytes32 CAIP-2 hash for cross-chain payload
        bytes32 reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);

        // Store acknowledgement with randomized grace period
        _pendingAcknowledgements[wallet] = AcknowledgementData({
            trustedForwarder: trustedForwarder,
            incidentTimestamp: incidentTimestamp,
            reportedChainId: reportedChainIdHash,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit WalletAcknowledged(wallet, trustedForwarder, reportedChainIdHash, incidentTimestamp, isSponsored);
    }

    /// @inheritdoc ISpokeRegistry
    function register(
        address wallet,
        address trustedForwarder,
        uint64 reportedChainId,
        uint64 incidentTimestamp,
        uint256 deadline,
        uint256 nonce,
        uint256 windowBlock,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Collapsed into a memory struct before validation: with `windowBlock` added, passing
        // these flat exceeded the EVM's 16-slot stack limit (this project builds without
        // via-ir). A memory struct costs one stack slot instead of ten. The EXTERNAL signature
        // stays flat and byte-identical to the hub's — the unification is preserved.
        WalletRegParams memory p = WalletRegParams({
            wallet: wallet,
            trustedForwarder: trustedForwarder,
            reportedChainId: reportedChainId,
            incidentTimestamp: incidentTimestamp,
            deadline: deadline,
            nonce: nonce,
            windowBlock: windowBlock,
            v: v,
            r: r,
            s: s
        });

        // Validate inputs and signature, get data needed for payload
        (bytes32 digest, bytes32 reportedChainIdHash) = _validateWalletRegistration(p);

        // Determine sponsorship
        bool isSponsored = wallet != trustedForwarder;

        // Build and send cross-chain message
        _executeWalletRegistration(wallet, reportedChainIdHash, incidentTimestamp, nonce, isSponsored, digest);
    }

    /// @dev Internal-only carrier for {register}'s arguments. Exists purely to keep the
    ///      validation path within the stack limit; never appears in the external ABI.
    ///
    ///      Field order deliberately mirrors the external `register` parameter order for
    ///      reviewability. solhint's `gas-struct-packing` flags this as inefficiently packed —
    ///      that warning does not apply: this struct is only ever instantiated in MEMORY and is
    ///      never written to storage, so slot packing has no gas consequence. Reordering fields
    ///      to silence the linter would obscure the mapping to the function signature for zero
    ///      benefit. Do NOT add packed fields here on the assumption it is a storage struct —
    ///      the 1-slot storage invariant applies to entry structs, not this carrier.
    // Suppressed, not fixed: packing advice is meaningless for a memory-only struct, and acting on
    // it here would invite a reader to confuse this carrier with a real entry struct, where the
    // repo's hard 1-storage-slot invariant does apply. See the NatSpec above.
    // solhint-disable-next-line gas-struct-packing
    struct WalletRegParams {
        address wallet;
        address trustedForwarder;
        uint64 reportedChainId;
        uint64 incidentTimestamp;
        uint256 deadline;
        uint256 nonce;
        uint256 windowBlock;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Validate wallet registration inputs and signature (reduces stack pressure in main function)
    function _validateWalletRegistration(WalletRegParams memory p)
        internal
        view
        returns (bytes32 digest, bytes32 reportedChainIdHash)
    {
        address wallet = p.wallet;
        address trustedForwarder = p.trustedForwarder;
        uint64 reportedChainId = p.reportedChainId;
        uint64 incidentTimestamp = p.incidentTimestamp;
        uint256 deadline = p.deadline;
        uint256 nonce = p.nonce;
        // Fail fast: reject zero address and trusted forwarder mismatch
        if (wallet == address(0)) revert SpokeRegistry__InvalidOwner();
        if (trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Accepted range lives in TimingConfig.isSignatureDeadlineValid; the inner branch
        // only picks which of the two user-facing errors to report.
        if (!TimingConfig.isSignatureDeadlineValid(deadline)) {
            if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();
            revert SpokeRegistry__DeadlineTooFarInFuture();
        }

        // Validate nonce matches expected value
        if (nonce != nonces[wallet]) revert SpokeRegistry__InvalidNonce();

        // Load and validate acknowledgement BEFORE signature verification: the digest now
        // commits to a block hash bounded by `ack.startBlock`, so the acknowledgement must be
        // read first. (Ordering differs from the pre-V1 code for exactly this reason.)
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistry__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistry__ForwarderExpired();

        // ANTI-PHISHING: see {WalletRegistry.register}. Kept byte-identical to the hub so a
        // single frontend code path serves both, per the hub/spoke signature unification.
        bytes32 windowBlockHash = TimingConfig.resolveWindowBlockHash(p.windowBlock, ack.startBlock);

        // Compute digest and verify signature (uses trustedForwarder param)
        digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712Constants.WALLET_REG_TYPEHASH,
                    EIP712Constants.REG_STATEMENT_HASH,
                    wallet,
                    trustedForwarder,
                    reportedChainId,
                    incidentTimestamp,
                    nonce,
                    deadline,
                    windowBlockHash
                )
            )
        );
        address signer = ECDSA.recover(digest, p.v, p.r, p.s);
        if (signer == address(0) || signer != wallet) revert SpokeRegistry__InvalidSigner();

        // Convert uint64 to bytes32 hash for comparison and return
        reportedChainIdHash = CAIP10Evm.caip2Hash(reportedChainId);
        if (ack.reportedChainId != reportedChainIdHash || ack.incidentTimestamp != incidentTimestamp) {
            revert SpokeRegistry__DataMismatch();
        }
    }

    /// @dev Execute wallet registration state changes and cross-chain message (CEI pattern)
    function _executeWalletRegistration(
        address wallet,
        bytes32 reportedChainIdHash,
        uint64 incidentTimestamp,
        uint256 nonce,
        bool isSponsored,
        bytes32 registrationHash
    ) internal {
        // Build cross-chain payload (format for FraudRegistryHub)
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: CAIP10Evm.evmChainRefHash(uint64(block.chainid)),
            identifier: bytes32(uint256(uint160(wallet))),
            reportedChainId: reportedChainIdHash,
            incidentTimestamp: incidentTimestamp,
            sourceChainId: sourceChainId,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: uint64(block.timestamp),
            registrationHash: registrationHash
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        // Quote fees
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;
        uint256 totalRequired = bridgeFee + registrationFee;

        if (msg.value < totalRequired) revert SpokeRegistry__InsufficientFee();

        // EFFECTS: State changes before external calls (CEI pattern)
        nonces[wallet]++;
        delete _pendingAcknowledgements[wallet];

        // INTERACTIONS: External calls
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit RegistrationSentToHub(wallet, messageId, hubChainId);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeRegistry__RefundFailed();
        }
    }

    /// @inheritdoc ISpokeRegistry
    /// @dev Transaction batches use msg.sender as the implicit trusted forwarder rather than accepting an
    ///      explicit trustedForwarder parameter. Third-party submission IS supported: if msg.sender != reporter,
    ///      the tx is marked as sponsored and msg.sender is stored as trustedForwarder. The reporter
    ///      signs an EIP-712 message that includes msg.sender, so the relayer must be known at sign time.
    function acknowledgeTransactionBatch(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint32 transactionCount,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Fail fast: reject zero address
        if (reporter == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate hub is configured — see the wallet-path acknowledge for why phase 1 must check
        // this and not leave it to phase 2.
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Validate dataHash is not zero
        if (dataHash == bytes32(0)) revert SpokeRegistry__InvalidDataHash();

        // Validate batch size
        if (transactionCount == 0) revert SpokeRegistry__EmptyBatch();
        if (transactionCount > MAX_CROSS_CHAIN_BATCH_SIZE) revert SpokeRegistry__BatchTooLarge();

        // Accepted range lives in TimingConfig.isSignatureDeadlineValid; the inner branch
        // only picks which of the two user-facing errors to report.
        if (!TimingConfig.isSignatureDeadlineValid(deadline)) {
            if (deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();
            revert SpokeRegistry__DeadlineTooFarInFuture();
        }

        // Reject re-acknowledgement while a prior one is still live, matching
        // TransactionRegistry.acknowledgeTransactions on the hub (and the wallet path above).
        // Overwriting would restart the grace period and strand the registration signature the
        // reporter produced against the first acknowledgement.
        {
            TransactionAcknowledgementData memory existing = _pendingTxAcknowledgements[reporter];
            if (existing.trustedForwarder != address(0) && block.number < existing.expiryBlock) {
                revert SpokeRegistry__AlreadyAcknowledged();
            }
        }

        // Validate nonce matches expected value (transaction-flow counter — see {txNonces})
        if (nonce != txNonces[reporter]) revert SpokeRegistry__InvalidNonce();

        // Verify EIP-712 signature
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    EIP712Constants.TX_BATCH_ACK_TYPEHASH,
                    EIP712Constants.TX_ACK_STATEMENT_HASH,
                    reporter,
                    msg.sender,
                    dataHash,
                    reportedChainId,
                    transactionCount,
                    nonce,
                    deadline
                )
            )
        );
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer == address(0) || signer != reporter) revert SpokeRegistry__InvalidSigner();

        // Increment nonce AFTER validation
        txNonces[reporter]++;

        // Store acknowledgement with randomized grace period
        _pendingTxAcknowledgements[reporter] = TransactionAcknowledgementData({
            trustedForwarder: msg.sender,
            dataHash: dataHash,
            reportedChainId: reportedChainId,
            transactionCount: transactionCount,
            startBlock: TimingConfig.getGracePeriodEndBlock(graceBlocks),
            expiryBlock: TimingConfig.getDeadlineBlock(deadlineBlocks)
        });

        emit TransactionBatchAcknowledged(
            reporter, msg.sender, dataHash, reportedChainId, transactionCount, reporter != msg.sender
        );
    }

    /// @inheritdoc ISpokeRegistry
    function registerTransactionBatch(
        bytes32 reportedChainId,
        uint256 deadline,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds,
        uint256 windowBlock,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        // Collapsed into a memory struct before validation: with `windowBlock` added, passing
        // these flat alongside two calldata arrays exceeded the EVM's 16-slot stack limit (this
        // project builds without via-ir). Same treatment as {WalletRegParams} on the wallet
        // path. The EXTERNAL signature stays flat.
        TxBatchRegParams memory p = TxBatchRegParams({
            reportedChainId: reportedChainId,
            deadline: deadline,
            nonce: nonce,
            reporter: reporter,
            windowBlock: windowBlock,
            v: v,
            r: r,
            s: s
        });

        // Compute dataHash from submitted arrays - this is the key verification
        bytes32 dataHash = keccak256(abi.encode(transactionHashes, chainIds));

        // Validate inputs and acknowledgement (reverts on failure). Returns the anti-phishing
        // freshness commitment the signature must have been produced against.
        bytes32 windowBlockHash = _validateTxBatchRegistration(p, dataHash, transactionHashes, chainIds);

        // Verify EIP-712 signature
        _verifyTxBatchSignature(p, dataHash, transactionHashes.length, windowBlockHash);

        // Execute registration (state changes + cross-chain message). Reads through `p` rather
        // than the flat parameters so the latter are dead by here — with ten of them plus two
        // calldata arrays, keeping any alive to this point overflows the 16-slot stack.
        _executeTxBatchRegistration(dataHash, p.reportedChainId, p.nonce, p.reporter, transactionHashes, chainIds);
    }

    /// @dev Internal-only carrier for {registerTransactionBatch}'s scalar arguments. Exists purely
    ///      to keep the validation path within the stack limit; never appears in the external ABI.
    ///      The calldata arrays stay out of it — copying them to memory would cost gas for no
    ///      stack benefit. See {WalletRegParams} for the same rationale on the wallet path; the
    ///      solhint `gas-struct-packing` note applies here too (memory-only, never stored).
    // Suppressed, not fixed: packing advice is meaningless for a memory-only struct, and acting on
    // it here would invite a reader to confuse this carrier with a real entry struct, where the
    // repo's hard 1-storage-slot invariant does apply. See {WalletRegParams}.
    // solhint-disable-next-line gas-struct-packing
    struct TxBatchRegParams {
        bytes32 reportedChainId;
        uint256 deadline;
        uint256 nonce;
        address reporter;
        uint256 windowBlock;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc ISpokeRegistry
    function isPending(address wallet) external view returns (bool) {
        AcknowledgementData memory ack = _pendingAcknowledgements[wallet];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getAcknowledgement(address wallet) external view returns (AcknowledgementData memory) {
        return _pendingAcknowledgements[wallet];
    }

    /// @inheritdoc ISpokeRegistry
    function isPendingTransactionBatch(address reporter) external view returns (bool) {
        TransactionAcknowledgementData memory ack = _pendingTxAcknowledgements[reporter];
        return ack.trustedForwarder != address(0) && block.number < ack.expiryBlock;
    }

    /// @inheritdoc ISpokeRegistry
    function getTransactionAcknowledgement(address reporter)
        external
        view
        returns (TransactionAcknowledgementData memory)
    {
        return _pendingTxAcknowledgements[reporter];
    }

    /// @inheritdoc ISpokeRegistry
    function quoteRegistration(address wallet) external view returns (uint256) {
        // Build dummy payload to get accurate quote
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(wallet))),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: sourceChainId,
            isSponsored: false,
            nonce: nonces[wallet],
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return bridgeFee + registrationFee;
    }

    /// @inheritdoc ISpokeRegistry
    function quoteTransactionBatchRegistration(address reporter) external view returns (uint256) {
        uint256 bridgeFee = _quoteTransactionBatchBridgeFee(reporter);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return bridgeFee + registrationFee;
    }

    /// @inheritdoc ISpokeRegistry
    function quoteTransactionBatchFeeBreakdown(address reporter) external view returns (FeeBreakdown memory) {
        uint256 bridgeFee = _quoteTransactionBatchBridgeFee(reporter);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return FeeBreakdown({
            bridgeFee: bridgeFee,
            registrationFee: registrationFee,
            total: bridgeFee + registrationFee,
            bridgeName: IBridgeAdapter(bridgeAdapter).bridgeName()
        });
    }

    /// @dev Bridge fee for the reporter's pending transaction batch, priced on the acknowledged
    ///      entry count. Shared by the total and breakdown quotes so the two can never disagree.
    function _quoteTransactionBatchBridgeFee(address reporter) internal view returns (uint256) {
        uint32 count = _pendingTxAcknowledgements[reporter].transactionCount;
        if (count == 0) count = 1;

        // Zero-filled arrays of the acknowledged length: the adapter prices on the declared entry
        // count, and matching the real payload length keeps the quote correct for any bridge that
        // also prices on message size.
        bytes32[] memory empty = new bytes32[](count);

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            dataHash: bytes32(0),
            reporter: reporter,
            reportedChainId: bytes32(0),
            sourceChainId: sourceChainId,
            transactionCount: count,
            isSponsored: false,
            nonce: txNonces[reporter],
            timestamp: uint64(block.timestamp),
            transactionHashes: empty,
            chainIds: empty
        });

        return IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, payload.encodeTransactionBatch());
    }

    /// @inheritdoc ISpokeRegistry
    function quoteFeeBreakdown(address wallet) external view returns (FeeBreakdown memory) {
        // Build payload for accurate quote
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: CAIP10.NAMESPACE_EIP155,
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(wallet))),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: sourceChainId,
            isSponsored: false,
            nonce: nonces[wallet],
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory encodedPayload = payload.encodeWalletRegistration();

        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        string memory bridgeName = IBridgeAdapter(bridgeAdapter).bridgeName();
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;

        return FeeBreakdown({
            bridgeFee: bridgeFee,
            registrationFee: registrationFee,
            total: bridgeFee + registrationFee,
            bridgeName: bridgeName
        });
    }

    /// @inheritdoc ISpokeRegistry
    /// @dev Returns ONLY the deadline. There is deliberately no hash-struct return value.
    ///      The registration typehashes gained `windowBlockHash` (audit finding V1), and that
    ///      value is NOT knowable here: the frontend calls this BEFORE signing to obtain the
    ///      deadline, and resolves the window block later, at signing time. Any digest this
    ///      function could build for the registration phase would therefore be missing a member
    ///      the typehash declares — a digest no wallet will ever produce and no verifier will
    ///      ever accept. It previously returned exactly that, silently. Callers build their own
    ///      typed data (see `packages/signatures`); this call exists for the deadline alone.
    ///      Do NOT reintroduce a hash-struct return by adding a `windowBlockHash` parameter —
    ///      the caller does not have one at this point in the flow.
    function getSignatureDeadline(
        uint64, /* reportedChainId */
        uint64, /* incidentTimestamp */
        address, /* trustedForwarder */
        uint8 step
    )
        external
        view
        returns (uint256 deadline)
    {
        if (step != 1 && step != 2) revert SpokeRegistry__InvalidStep();
        return TimingConfig.getSignatureDeadline();
    }

    /// @inheritdoc ISpokeRegistry
    /// @dev Returns ONLY the deadline. There is deliberately no hash-struct return value.
    ///      The registration typehashes gained `windowBlockHash` (audit finding V1), and that
    ///      value is NOT knowable here: the frontend calls this BEFORE signing to obtain the
    ///      deadline, and resolves the window block later, at signing time. Any digest this
    ///      function could build for the registration phase would therefore be missing a member
    ///      the typehash declares — a digest no wallet will ever produce and no verifier will
    ///      ever accept. It previously returned exactly that, silently. Callers build their own
    ///      typed data (see `packages/signatures`); this call exists for the deadline alone.
    ///      Do NOT reintroduce a hash-struct return by adding a `windowBlockHash` parameter —
    ///      the caller does not have one at this point in the flow.
    function getTransactionSignatureDeadline(
        bytes32, /* dataHash */
        bytes32, /* reportedChainId */
        uint32, /* transactionCount */
        address, /* trustedForwarder */
        uint8 step
    )
        external
        view
        returns (uint256 deadline)
    {
        if (step != 1 && step != 2) revert SpokeRegistry__InvalidStep();
        return TimingConfig.getSignatureDeadline();
    }

    /// @dev Compute deadline fields from acknowledgement timing data
    function _computeDeadlineFields(uint256 startBlock_, uint256 expiryBlock_)
        internal
        view
        returns (uint256 graceStartsAt, uint256 timeLeft, bool isExpired)
    {
        if (expiryBlock_ <= block.number) {
            isExpired = true;
        } else {
            timeLeft = expiryBlock_ - block.number;
            graceStartsAt = startBlock_ > block.number ? startBlock_ - block.number : 0;
        }
    }

    /// @inheritdoc ISpokeRegistry
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
        AcknowledgementData memory ack = _pendingAcknowledgements[session];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;
        (graceStartsAt, timeLeft, isExpired) = _computeDeadlineFields(ack.startBlock, ack.expiryBlock);
    }

    /// @inheritdoc ISpokeRegistry
    function getTransactionDeadlines(address reporter)
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
        TransactionAcknowledgementData memory ack = _pendingTxAcknowledgements[reporter];
        currentBlock = block.number;
        expiryBlock = ack.expiryBlock;
        startBlock = ack.startBlock;
        (graceStartsAt, timeLeft, isExpired) = _computeDeadlineFields(ack.startBlock, ack.expiryBlock);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Update hub chain configuration
    /// @dev Both values must be set together, or both must be zero (unconfigured).
    ///      Immediate during initial setup, timelocked after completeSetup().
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner onlyDuringSetup {
        _setHubConfig(_hubChainId, _hubInbox);
    }

    /// @notice Propose a hub configuration change (2-day delay before activation)
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function proposeHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setHubConfig", _hubChainId, _hubInbox)));
    }

    /// @notice Activate a previously proposed hub configuration change
    /// @param _hubChainId Hub chain domain ID
    /// @param _hubInbox Hub inbox address
    function activateHubConfig(uint32 _hubChainId, bytes32 _hubInbox) external onlyOwner {
        _activateAction(keccak256(abi.encode("setHubConfig", _hubChainId, _hubInbox)));
        _setHubConfig(_hubChainId, _hubInbox);
    }

    function _setHubConfig(uint32 _hubChainId, bytes32 _hubInbox) internal {
        // Enforce "both set or both zero" invariant
        bool hubChainIdSet = _hubChainId != 0;
        bool hubInboxSet = _hubInbox != bytes32(0);
        if (hubChainIdSet != hubInboxSet) {
            revert SpokeRegistry__InvalidHubConfig();
        }
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
        emit FeesWithdrawn(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Enforces every precondition of phase two of the two-phase transaction-batch flow
    ///         BEFORE any signature is recovered, and returns the freshness commitment that
    ///         signature must contain.
    /// @dev Ordered fail-fast; each check maps to a distinct revert so the frontend can tell the
    ///      user which one tripped:
    ///        - zero reporter -> `SpokeRegistry__InvalidOwner`; unset hub -> `__HubNotConfigured`
    ///          (a spoke with no hub would accept a batch it could never bridge);
    ///        - the two caller-supplied arrays disagreeing in length / empty batch ->
    ///          `__ArrayLengthMismatch` / `__EmptyBatch`. These are caller bugs, not tampering;
    ///        - deadline outside the accepted band -> `__SignatureExpired` when already past,
    ///          `__DeadlineTooFarInFuture` otherwise. The band itself is owned by
    ///          {TimingConfig.isSignatureDeadlineValid}; the inner branch only picks the error;
    ///        - `nonce` must equal the reporter's current nonce -> `__InvalidNonce` (replay);
    ///        - `msg.sender` must be the forwarder named in the acknowledgement ->
    ///          `__InvalidForwarder`, so a third party cannot land someone else's signed batch;
    ///        - the grace period must have STARTED and not yet expired ->
    ///          `__GracePeriodNotStarted` / `__ForwarderExpired`. The start check is the
    ///          anti-phishing delay; skipping it collapses the flow to a single sitting;
    ///        - `dataHash` must equal what was acknowledged -> `__DataHashMismatch`. Since
    ///          `dataHash` is recomputed by the caller from the submitted arrays, this is what
    ///          proves the arrays are exactly the ones signed — without it a forwarder could swap
    ///          in a different set of transactions;
    ///        - `reportedChainId` must equal what was acknowledged -> `__ChainIdMismatch`;
    ///        - `transactionCount` must match the acknowledged count -> `__BatchCountMismatch`.
    ///      Those last three are TAMPERING signals rather than caller bugs — the submitted batch
    ///      is well-formed but is not the batch the reporter signed for — and each gets its own
    ///      error so the frontend can report the specific discrepancy instead of a generic one.
    ///      View-only: it makes no state changes, so a revert here costs the caller nothing but
    ///      gas and leaves the pending acknowledgement intact for a corrected retry.
    /// @param p Scalar registration arguments (reporter, deadline, nonce, reportedChainId,
    ///          windowBlock, v/r/s). Collapsed into a struct only to stay under the stack limit.
    /// @param dataHash keccak256 of the submitted `(transactionHashes, chainIds)`, recomputed by
    ///        the caller and checked against the acknowledged commitment
    /// @param transactionHashes Transaction hashes being registered; length and content are both
    ///        constrained (count against the acknowledgement, content via `dataHash`)
    /// @param chainIds CAIP-2 chain ID hash per transaction; must be the same length as
    ///        `transactionHashes` and is covered by the same `dataHash`
    /// @return windowBlockHash The freshness commitment the signature must have committed to
    function _validateTxBatchRegistration(
        TxBatchRegParams memory p,
        bytes32 dataHash,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal view returns (bytes32 windowBlockHash) {
        // Fail fast: reject zero address
        if (p.reporter == address(0)) revert SpokeRegistry__InvalidOwner();

        // Validate hub is configured
        if (hubInbox == bytes32(0)) revert SpokeRegistry__HubNotConfigured();

        // Validate arrays match
        if (transactionHashes.length != chainIds.length) revert SpokeRegistry__ArrayLengthMismatch();
        if (transactionHashes.length == 0) revert SpokeRegistry__EmptyBatch();

        // Accepted range lives in TimingConfig.isSignatureDeadlineValid; the inner branch
        // only picks which of the two user-facing errors to report.
        if (!TimingConfig.isSignatureDeadlineValid(p.deadline)) {
            if (p.deadline <= block.timestamp) revert SpokeRegistry__SignatureExpired();
            revert SpokeRegistry__DeadlineTooFarInFuture();
        }

        // Validate nonce matches expected value (transaction-flow counter — see {txNonces})
        if (p.nonce != txNonces[p.reporter]) revert SpokeRegistry__InvalidNonce();

        // Load and validate acknowledgement
        TransactionAcknowledgementData memory ack = _pendingTxAcknowledgements[p.reporter];
        if (ack.trustedForwarder != msg.sender) revert SpokeRegistry__InvalidForwarder();
        if (block.number < ack.startBlock) revert SpokeRegistry__GracePeriodNotStarted();
        if (block.number >= ack.expiryBlock) revert SpokeRegistry__ForwarderExpired();

        // Validate computed dataHash matches what was acknowledged.
        // This proves the submitted arrays are exactly what the user signed. Each of the three
        // checks below is a distinct TAMPERING signal, not a caller bug, so they get distinct
        // errors: a swapped transaction set, a swapped chain, and a resized batch are different
        // incidents and the frontend must be able to tell them apart.
        if (ack.dataHash != dataHash) revert SpokeRegistry__DataHashMismatch();
        if (ack.reportedChainId != p.reportedChainId) revert SpokeRegistry__ChainIdMismatch();
        if (ack.transactionCount != transactionHashes.length) {
            revert SpokeRegistry__BatchCountMismatch();
        }

        // ANTI-PHISHING: see {WalletRegistry.register}. The signature commits to the hash of a
        // block at or after the grace period started, so it cannot have been produced in the
        // same sitting as the acknowledgement. Kept identical to the wallet path and the hub's
        // TransactionRegistry so one frontend code path serves all three.
        windowBlockHash = TimingConfig.resolveWindowBlockHash(p.windowBlock, ack.startBlock);
    }

    /// @dev Verify EIP-712 signature for transaction batch registration
    function _verifyTxBatchSignature(
        TxBatchRegParams memory p,
        bytes32 dataHash,
        uint256 txCount,
        bytes32 windowBlockHash
    ) internal view {
        bytes32 structHash = _computeTxBatchRegStructHash(p, dataHash, txCount, windowBlockHash);
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, p.v, p.r, p.s);
        if (signer == address(0) || signer != p.reporter) revert SpokeRegistry__InvalidSigner();
    }

    /// @dev Compute struct hash for transaction batch registration (avoids stack too deep)
    /// @dev The encoded member list MUST stay in lockstep with
    ///      {EIP712Constants.TX_BATCH_REG_TYPEHASH}, which declares nine members. It previously
    ///      stopped at `deadline` — eight members under a nine-member typehash — so the digest
    ///      disagreed with the one the frontend signature builder produces, and the freshness
    ///      commitment was absent entirely. Do not add or drop a field here without changing
    ///      the typehash.
    function _computeTxBatchRegStructHash(
        TxBatchRegParams memory p,
        bytes32 dataHash,
        uint256 txCount,
        bytes32 windowBlockHash
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712Constants.TX_BATCH_REG_TYPEHASH,
                EIP712Constants.TX_REG_STATEMENT_HASH,
                p.reporter,
                msg.sender,
                dataHash,
                p.reportedChainId,
                uint32(txCount),
                p.nonce,
                p.deadline,
                windowBlockHash
            )
        );
    }

    /// @dev Execute transaction batch registration (state changes + cross-chain message)
    /// @notice Follows CEI pattern: state changes first, then external calls
    /// @param dataHash Hash of (txHashes, chainIds) for verification
    /// @param reportedChainId CAIP-2 chain ID hash where incident occurred
    /// @param nonce The validated nonce for replay protection
    /// @param reporter The address that acknowledged the registration
    /// @param transactionHashes Array of transaction hashes to register
    /// @param chainIds Array of CAIP-2 chain ID hashes for each transaction
    function _executeTxBatchRegistration(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal {
        // Build cross-chain payload (view operation, no state changes)
        bytes memory encodedPayload =
            _encodeTxBatchPayload(dataHash, reportedChainId, nonce, reporter, transactionHashes, chainIds);

        // ACCEPTED RISK (V8, spoke side): the registration fee is charged here, at dispatch time,
        // but dedup happens on the hub. If every hash in this batch is already registered on the
        // hub, the hub writes a zero-entry batch and this fee bought nothing. Unlike the hub-local
        // path — which now refunds when zero entries are written — the spoke cannot know hub state
        // at dispatch, and refunding would require a return message from the hub (an extra bridge
        // hop and its fee, plus a callback trust boundary). Deliberately not fixed; treasury-side
        // reimbursement is the intended remedy.
        // Quote and validate fees BEFORE state changes (matches wallet registration pattern)
        uint256 bridgeFee = IBridgeAdapter(bridgeAdapter).quoteMessage(hubChainId, encodedPayload);
        uint256 registrationFee = feeManager != address(0) ? IFeeManager(feeManager).currentFeeWei() : 0;
        uint256 totalRequired = bridgeFee + registrationFee;

        if (msg.value < totalRequired) revert SpokeRegistry__InsufficientFee();

        // EFFECTS: Update state after fee validation
        txNonces[reporter]++;
        delete _pendingTxAcknowledgements[reporter];

        // INTERACTIONS: Send cross-chain message
        bytes32 messageId =
            IBridgeAdapter(bridgeAdapter).sendMessage{ value: bridgeFee }(hubChainId, hubInbox, encodedPayload);

        emit TransactionBatchSentToHub(reporter, messageId, dataHash, hubChainId);

        // Refund excess (registration fee stays on spoke for treasury sweep)
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert SpokeRegistry__RefundFailed();
        }
    }

    /// @dev Encode transaction batch payload for cross-chain transport
    function _encodeTxBatchPayload(
        bytes32 dataHash,
        bytes32 reportedChainId,
        uint256 nonce,
        address reporter,
        bytes32[] calldata transactionHashes,
        bytes32[] calldata chainIds
    ) internal view returns (bytes memory) {
        CrossChainMessage.TransactionBatchPayload memory payload =
            CrossChainMessage.TransactionBatchPayload({
                dataHash: dataHash,
                reporter: reporter,
                reportedChainId: reportedChainId,
                sourceChainId: sourceChainId,
                transactionCount: uint32(transactionHashes.length),
                isSponsored: reporter != msg.sender,
                nonce: nonce,
                timestamp: uint64(block.timestamp),
                transactionHashes: transactionHashes,
                chainIds: chainIds
            });

        return payload.encodeTransactionBatch();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE ETH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Accept ETH for cross-chain fees and refunds
    receive() external payable { }
}
