// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { CAIP10 } from "../src/libraries/CAIP10.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

/// @title WalletRegistryTest
/// @notice Comprehensive tests for the WalletRegistry contract (hub-side wallet registry)
/// @dev Tests cover the full two-phase registration flow, cross-chain hub registrations,
///      operator batch registrations, view functions, admin functions, and constructor validation.
contract WalletRegistryTest is EIP712TestHelper {
    WalletRegistry public walletRegistry;
    FraudRegistryHub public hub;

    // Allow test contract to receive ETH (needed for withdrawCollectedFees tests)
    receive() external payable { }

    // Test accounts
    uint256 internal walletPrivateKey;
    address internal wallet;
    address internal forwarder;
    address internal owner;

    // Timing configuration
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // Default incident data
    uint64 internal constant REPORTED_CHAIN_ID = 1; // Mainnet
    uint64 internal incidentTimestamp;

    // Redeclare events from IWalletRegistry so forge can match them
    event WalletAcknowledged(address indexed registeree, address indexed trustedForwarder, bool isSponsored);
    event WalletRegistered(
        bytes32 indexed identifier, bytes32 indexed reportedChainId, uint64 incidentTimestamp, bool isSponsored
    );
    event CrossChainWalletRegistered(
        bytes32 indexed identifier, bytes32 indexed sourceChainId, uint8 bridgeId, bytes32 messageId
    );
    event BatchCreated(uint256 indexed batchId, bytes32 indexed operatorId, uint32 walletCount);
    event HubUpdated(address oldHub, address newHub);
    event OperatorSubmitterUpdated(address oldOperatorSubmitter, address newOperatorSubmitter);

    function setUp() public {
        // Set block timestamp to something reasonable
        vm.warp(1_704_067_200); // 2024-01-01

        // Create test accounts
        walletPrivateKey = uint256(keccak256("test wallet")); // deterministic test-only key
        wallet = vm.addr(walletPrivateKey);
        forwarder = makeAddr("forwarder");
        owner = address(this);

        incidentTimestamp = uint64(block.timestamp - 1 days);

        // Deploy WalletRegistry with no feeManager (free registrations)
        walletRegistry = new WalletRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Deploy FraudRegistryHub
        hub = new FraudRegistryHub(owner, owner);

        // Wire up hub <-> wallet registry
        walletRegistry.setHub(address(hub));
        hub.setWalletRegistry(address(walletRegistry));

        // Fund test accounts
        vm.deal(wallet, 10 ether);
        vm.deal(forwarder, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Execute the full acknowledgement flow with default incident data
    function _doAck(address _forwarder, uint64 reportedChainId, uint64 _incidentTimestamp) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            _forwarder,
            reportedChainId,
            _incidentTimestamp,
            nonce,
            deadline
        );
        vm.prank(_forwarder);
        walletRegistry.acknowledge(wallet, _forwarder, reportedChainId, _incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @dev Skip block.number to the grace period start so registration is allowed
    function _skipToRegistrationWindow() internal {
        IWalletRegistry.AcknowledgementData memory ack = walletRegistry.getAcknowledgementData(wallet);
        vm.roll(ack.gracePeriodStart);
    }

    /// @dev Execute the full two-phase flow (ack + skip + register)
    function _doFullRegistration(address _forwarder, uint64 reportedChainId, uint64 _incidentTimestamp) internal {
        _doAck(_forwarder, reportedChainId, _incidentTimestamp);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            _forwarder,
            reportedChainId,
            _incidentTimestamp,
            nonce,
            deadline
        );
        vm.prank(_forwarder);
        walletRegistry.register(wallet, _forwarder, reportedChainId, _incidentTimestamp, deadline, nonce, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor rejects zero owner address
    /// @dev OpenZeppelin's Ownable reverts with OwnableInvalidOwner before the custom check
    function test_Constructor_RejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new WalletRegistry(address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
    }

    /// @notice Constructor rejects invalid timing where deadlineBlocks < 2 * graceBlocks
    function test_Constructor_RejectsInvalidTiming() public {
        // deadlineBlocks (15) < 2 * graceBlocks (10) = 20, should revert
        vm.expectRevert(IWalletRegistry.WalletRegistry__DeadlineInPast.selector);
        new WalletRegistry(owner, address(0), 10, 15);
    }

    /// @notice Constructor rejects zero graceBlocks
    function test_Constructor_RejectsZeroGraceBlocks() public {
        vm.expectRevert(IWalletRegistry.WalletRegistry__DeadlineInPast.selector);
        new WalletRegistry(owner, address(0), 0, 50);
    }

    /// @notice Constructor rejects zero deadlineBlocks
    function test_Constructor_RejectsZeroDeadlineBlocks() public {
        vm.expectRevert(IWalletRegistry.WalletRegistry__DeadlineInPast.selector);
        new WalletRegistry(owner, address(0), 10, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TWO-PHASE FLOW: ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Valid acknowledgement succeeds, emits WalletAcknowledged, sets isPending, increments nonce
    function test_Acknowledge_Success() public {
        vm.expectEmit(true, true, false, true);
        emit WalletAcknowledged(wallet, forwarder, true);

        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);

        assertTrue(walletRegistry.isWalletPending(wallet));
        assertEq(walletRegistry.nonces(wallet), 1);

        // Verify stored ack data
        IWalletRegistry.AcknowledgementData memory ack = walletRegistry.getAcknowledgementData(wallet);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.reportedChainId, CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID));
        assertEq(ack.incidentTimestamp, incidentTimestamp);
        assertTrue(ack.isSponsored);
    }

    /// @notice Self-relay (wallet == forwarder) succeeds with isSponsored = false
    function test_Acknowledge_SelfRelay() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            wallet, // wallet is own forwarder
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit WalletAcknowledged(wallet, wallet, false); // isSponsored = false

        vm.prank(wallet);
        walletRegistry.acknowledge(wallet, wallet, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);

        assertTrue(walletRegistry.isWalletPending(wallet));
        IWalletRegistry.AcknowledgementData memory ack = walletRegistry.getAcknowledgementData(wallet);
        assertFalse(ack.isSponsored);
    }

    /// @notice Acknowledgement rejects registeree == address(0)
    function test_Acknowledge_RejectsZeroAddress() public {
        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__ZeroAddress.selector);
        walletRegistry.acknowledge(
            address(0),
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            block.timestamp + 1 hours,
            0,
            27,
            bytes32(0),
            bytes32(0)
        );
    }

    /// @notice Acknowledgement rejects forwarder == address(0)
    function test_Acknowledge_RejectsZeroForwarder() public {
        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__ZeroAddress.selector);
        walletRegistry.acknowledge(
            wallet,
            address(0),
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            block.timestamp + 1 hours,
            0,
            27,
            bytes32(0),
            bytes32(0)
        );
    }

    /// @notice Acknowledgement rejects expired deadline (deadline <= block.timestamp)
    function test_Acknowledge_RejectsExpiredDeadline() public {
        uint256 deadline = block.timestamp; // Not strictly past, but <= block.timestamp
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__DeadlineExpired.selector);
        walletRegistry.acknowledge(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Acknowledgement rejects already-registered wallet
    function test_Acknowledge_RejectsAlreadyRegistered() public {
        // Do a full registration first
        _doFullRegistration(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        assertTrue(walletRegistry.isWalletRegistered(wallet));

        // Try to acknowledge again
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__AlreadyRegistered.selector);
        walletRegistry.acknowledge(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Acknowledgement rejects when pending ack still active
    function test_Acknowledge_RejectsAlreadyAcknowledged() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        assertTrue(walletRegistry.isWalletPending(wallet));

        // Try second acknowledge while first is still active
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__AlreadyAcknowledged.selector);
        walletRegistry.acknowledge(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Acknowledgement rejects wrong nonce
    function test_Acknowledge_RejectsInvalidNonce() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            wrongNonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidNonce.selector);
        walletRegistry.acknowledge(
            wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, wrongNonce, v, r, s
        );
    }

    /// @notice Acknowledgement rejects invalid signature (wrong private key)
    function test_Acknowledge_RejectsInvalidSignature() public {
        uint256 wrongPrivateKey = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(
            wrongPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidSignature.selector);
        walletRegistry.acknowledge(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TWO-PHASE FLOW: REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full two-phase flow: ack -> grace period -> register succeeds
    function test_Register_Success() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        _skipToRegistrationWindow();

        bytes32 expectedIdentifier = bytes32(uint256(uint160(wallet)));
        bytes32 expectedChainIdHash = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);

        vm.expectEmit(true, true, false, true);
        emit WalletRegistered(expectedIdentifier, expectedChainIdHash, incidentTimestamp, true);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        walletRegistry.register(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);

        // Verify registration stored
        assertTrue(walletRegistry.isWalletRegistered(wallet));
        assertFalse(walletRegistry.isWalletPending(wallet));
        assertEq(walletRegistry.nonces(wallet), 2); // Two increments (ack + reg)

        // Verify wallet entry data
        IWalletRegistry.WalletEntry memory entry = walletRegistry.getWalletEntry(wallet);
        assertEq(entry.incidentTimestamp, incidentTimestamp);
        assertEq(entry.registeredAt, uint64(block.timestamp));
        assertTrue(entry.isSponsored);
        assertEq(entry.batchId, 0); // two-phase registration has no batch
        assertEq(entry.bridgeId, 0); // Local registration
    }

    /// @notice Registration rejects if called before grace period starts
    function test_Register_RejectsBeforeGracePeriod() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        // Don't skip to registration window — block.number is still before gracePeriodStart

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__GracePeriodNotStarted.selector);
        walletRegistry.register(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Registration rejects after acknowledgement deadline expires
    function test_Register_RejectsAfterExpiry() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);

        // Skip past the deadline block
        IWalletRegistry.AcknowledgementData memory ack = walletRegistry.getAcknowledgementData(wallet);
        vm.roll(ack.deadline); // >= deadline means expired

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__DeadlineExpired.selector);
        walletRegistry.register(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Registration rejects when msg.sender is not the authorized forwarder
    function test_Register_RejectsWrongForwarder() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrongForwarder");
        vm.deal(wrongForwarder, 10 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        // Sign with wrongForwarder in the sig (to match msg.sender), but ack stored forwarder
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            wrongForwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(wrongForwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidForwarder.selector);
        walletRegistry.register(wallet, wrongForwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Registration rejects invalid EIP-712 signature (wrong private key)
    function test_Register_RejectsInvalidSignature() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        _skipToRegistrationWindow();

        uint256 wrongPrivateKey = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            wrongPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidSignature.selector);
        walletRegistry.register(wallet, forwarder, REPORTED_CHAIN_ID, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Registration rejects mismatched reportedChainId between ack and register phases
    function test_Register_RejectsMismatchedReportedChainId() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        _skipToRegistrationWindow();

        // Use different reportedChainId in registration signature
        uint64 wrongChainId = 10; // Different from REPORTED_CHAIN_ID=1
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            wrongChainId,
            incidentTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidSignature.selector);
        walletRegistry.register(wallet, forwarder, wrongChainId, incidentTimestamp, deadline, nonce, v, r, s);
    }

    /// @notice Registration rejects mismatched incidentTimestamp between ack and register phases
    function test_Register_RejectsMismatchedIncidentTimestamp() public {
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        _skipToRegistrationWindow();

        uint64 wrongTimestamp = incidentTimestamp + 1;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(wallet);
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(
            walletPrivateKey,
            address(walletRegistry),
            wallet,
            forwarder,
            REPORTED_CHAIN_ID,
            wrongTimestamp,
            nonce,
            deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidSignature.selector);
        walletRegistry.register(wallet, forwarder, REPORTED_CHAIN_ID, wrongTimestamp, deadline, nonce, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN: registerFromHub TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub can register a wallet via registerFromHub, stores entry and emits both events
    function test_RegisterFromHub_Success() public {
        bytes32 identifier = bytes32(uint256(uint160(wallet)));
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(10)); // OP Mainnet
        bytes32 sourceChainId = CAIP10Evm.caip2Hash(uint64(11_155_420)); // OP Sepolia
        uint8 bridgeId = 1; // Hyperlane
        bytes32 messageId = keccak256("msg1");

        // Must be called by the hub's inbox, which routes through hub
        // For direct hub test, we set inbox on hub and call from inbox
        address inbox = makeAddr("inbox");
        hub.setInbox(inbox);

        vm.expectEmit(true, true, false, true, address(walletRegistry));
        emit WalletRegistered(identifier, reportedChainId, incidentTimestamp, true);

        vm.expectEmit(true, true, false, true, address(walletRegistry));
        emit CrossChainWalletRegistered(identifier, sourceChainId, bridgeId, messageId);

        // Call through the hub (which calls walletRegistry.registerFromHub)
        vm.prank(inbox);
        hub.registerWalletFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            bytes32(0), // chainRefHash ignored for EVM
            identifier,
            reportedChainId,
            incidentTimestamp,
            sourceChainId,
            true,
            bridgeId,
            messageId
        );

        // Verify wallet is registered
        assertTrue(walletRegistry.isWalletRegistered(wallet));
        IWalletRegistry.WalletEntry memory entry = walletRegistry.getWalletEntry(wallet);
        assertEq(entry.incidentTimestamp, incidentTimestamp);
        assertEq(entry.bridgeId, bridgeId);
        assertTrue(entry.isSponsored);
    }

    /// @notice registerFromHub silently succeeds (no revert) if wallet is already registered
    function test_RegisterFromHub_SilentlySucceedsIfAlreadyRegistered() public {
        // First register via two-phase
        _doFullRegistration(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        assertTrue(walletRegistry.isWalletRegistered(wallet));

        // Now try from hub — should not revert
        bytes32 identifier = bytes32(uint256(uint160(wallet)));
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(10));
        bytes32 sourceChainId = CAIP10Evm.caip2Hash(uint64(11_155_420));

        address inbox = makeAddr("inbox");
        hub.setInbox(inbox);

        vm.prank(inbox);
        hub.registerWalletFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            bytes32(0),
            identifier,
            reportedChainId,
            incidentTimestamp,
            sourceChainId,
            true,
            1,
            keccak256("msg2")
        );

        // Still registered — no state change, no revert
        assertTrue(walletRegistry.isWalletRegistered(wallet));
    }

    /// @notice registerFromHub reverts when called by a non-hub address
    function test_RegisterFromHub_RejectsNonHub() public {
        address randomCaller = makeAddr("randomCaller");
        bytes32 identifier = bytes32(uint256(uint160(wallet)));

        vm.prank(randomCaller);
        vm.expectRevert(IWalletRegistry.WalletRegistry__OnlyHub.selector);
        walletRegistry.registerFromHub(
            CAIP10.NAMESPACE_EIP155,
            bytes32(0),
            identifier,
            CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID),
            incidentTimestamp,
            CAIP10Evm.caip2Hash(uint64(block.chainid)),
            false,
            0,
            bytes32(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH: registerWalletsFromOperator TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Operator submitter can batch-register wallets, stores batch, emits events
    function test_RegisterFromOperator_Success() public {
        address opSubmitter = makeAddr("operatorSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        bytes32 operatorId = keccak256("operator1");
        bytes32[] memory identifiers = new bytes32[](3);
        bytes32[] memory reportedChainIds = new bytes32[](3);
        uint64[] memory timestamps = new uint64[](3);

        bytes32 chainIdHash = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);

        for (uint256 i = 0; i < 3; i++) {
            identifiers[i] = bytes32(uint256(uint160(makeAddr(string(abi.encodePacked("batchWallet", i))))));
            reportedChainIds[i] = chainIdHash;
            timestamps[i] = incidentTimestamp;
        }

        vm.expectEmit(true, true, false, true, address(walletRegistry));
        emit BatchCreated(1, operatorId, 3);

        vm.prank(opSubmitter);
        uint256 batchId =
            walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);

        assertEq(batchId, 1);
        assertEq(walletRegistry.batchCount(), 1);

        IWalletRegistry.Batch memory batch = walletRegistry.getBatch(batchId);
        assertEq(batch.operatorId, operatorId);
        assertEq(batch.walletCount, 3);
        assertEq(batch.timestamp, uint64(block.timestamp));

        // Verify each wallet is registered
        for (uint256 i = 0; i < 3; i++) {
            address w = address(uint160(uint256(identifiers[i])));
            assertTrue(walletRegistry.isWalletRegistered(w));
        }
    }

    /// @notice Operator batch skips zero identifiers silently
    function test_RegisterFromOperator_SkipsZeroIdentifiers() public {
        address opSubmitter = makeAddr("operatorSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        bytes32 operatorId = keccak256("operator1");
        bytes32 chainIdHash = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);

        bytes32[] memory identifiers = new bytes32[](3);
        bytes32[] memory reportedChainIds = new bytes32[](3);
        uint64[] memory timestamps = new uint64[](3);

        identifiers[0] = bytes32(uint256(uint160(makeAddr("bw1"))));
        identifiers[1] = bytes32(0); // Zero — should be skipped
        identifiers[2] = bytes32(uint256(uint160(makeAddr("bw3"))));
        reportedChainIds[0] = chainIdHash;
        reportedChainIds[1] = chainIdHash;
        reportedChainIds[2] = chainIdHash;
        timestamps[0] = incidentTimestamp;
        timestamps[1] = incidentTimestamp;
        timestamps[2] = incidentTimestamp;

        vm.prank(opSubmitter);
        uint256 batchId =
            walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);

        IWalletRegistry.Batch memory batch = walletRegistry.getBatch(batchId);
        assertEq(batch.walletCount, 2); // Only 2 valid entries
    }

    /// @notice Operator batch skips already-registered wallets silently
    function test_RegisterFromOperator_SkipsDuplicates() public {
        address opSubmitter = makeAddr("operatorSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        // Register wallet first via two-phase
        _doFullRegistration(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);
        assertTrue(walletRegistry.isWalletRegistered(wallet));

        bytes32 operatorId = keccak256("operator1");
        bytes32 chainIdHash = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);

        bytes32[] memory identifiers = new bytes32[](2);
        bytes32[] memory reportedChainIds = new bytes32[](2);
        uint64[] memory timestamps = new uint64[](2);

        identifiers[0] = bytes32(uint256(uint160(wallet))); // Already registered
        identifiers[1] = bytes32(uint256(uint160(makeAddr("newWallet"))));
        reportedChainIds[0] = chainIdHash;
        reportedChainIds[1] = chainIdHash;
        timestamps[0] = incidentTimestamp;
        timestamps[1] = incidentTimestamp;

        vm.prank(opSubmitter);
        uint256 batchId =
            walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);

        IWalletRegistry.Batch memory batch = walletRegistry.getBatch(batchId);
        assertEq(batch.walletCount, 1); // Only the new wallet counted
    }

    /// @notice Rejects non-operator-submitter caller
    function test_RegisterFromOperator_RejectsNonSubmitter() public {
        address randomCaller = makeAddr("randomCaller");
        bytes32 operatorId = keccak256("operator1");

        bytes32[] memory identifiers = new bytes32[](1);
        bytes32[] memory reportedChainIds = new bytes32[](1);
        uint64[] memory timestamps = new uint64[](1);
        identifiers[0] = bytes32(uint256(1));
        reportedChainIds[0] = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);
        timestamps[0] = incidentTimestamp;

        vm.prank(randomCaller);
        vm.expectRevert(IWalletRegistry.WalletRegistry__OnlyOperatorSubmitter.selector);
        walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);
    }

    /// @notice Rejects empty batch (length 0)
    function test_RegisterFromOperator_RejectsEmptyBatch() public {
        address opSubmitter = makeAddr("operatorSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        bytes32 operatorId = keccak256("operator1");
        bytes32[] memory identifiers = new bytes32[](0);
        bytes32[] memory reportedChainIds = new bytes32[](0);
        uint64[] memory timestamps = new uint64[](0);

        vm.prank(opSubmitter);
        vm.expectRevert(IWalletRegistry.WalletRegistry__EmptyBatch.selector);
        walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);
    }

    /// @notice Rejects array length mismatch
    function test_RegisterFromOperator_RejectsArrayMismatch() public {
        address opSubmitter = makeAddr("operatorSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        bytes32 operatorId = keccak256("operator1");
        bytes32[] memory identifiers = new bytes32[](2);
        bytes32[] memory reportedChainIds = new bytes32[](1); // Mismatched length
        uint64[] memory timestamps = new uint64[](2);

        identifiers[0] = bytes32(uint256(1));
        identifiers[1] = bytes32(uint256(2));
        reportedChainIds[0] = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);
        timestamps[0] = incidentTimestamp;
        timestamps[1] = incidentTimestamp;

        vm.prank(opSubmitter);
        vm.expectRevert(IWalletRegistry.WalletRegistry__ArrayLengthMismatch.selector);
        walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice generateHashStruct returns non-zero deadline and hashStruct for step 1 (ack) and step 2 (reg)
    function test_GenerateHashStruct_Step1And2() public {
        // Step 1 — acknowledgement
        vm.prank(wallet);
        (uint256 deadline1, bytes32 hash1) =
            walletRegistry.generateHashStruct(REPORTED_CHAIN_ID, incidentTimestamp, forwarder, 1);

        assertGt(deadline1, block.timestamp);
        assertTrue(hash1 != bytes32(0));

        // Step 2 — registration
        vm.prank(wallet);
        (uint256 deadline2, bytes32 hash2) =
            walletRegistry.generateHashStruct(REPORTED_CHAIN_ID, incidentTimestamp, forwarder, 2);

        assertGt(deadline2, block.timestamp);
        assertTrue(hash2 != bytes32(0));

        // Both steps should produce different hashStructs (different type hashes)
        assertTrue(hash1 != hash2);
    }

    /// @notice getDeadlines returns correct timing info before and after acknowledgement
    function test_GetDeadlines_BeforeAndAfterAck() public {
        // Before ack — all zeros, expired
        (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        ) = walletRegistry.getDeadlines(wallet);

        assertEq(currentBlock, block.number);
        assertEq(expiryBlock, 0);
        assertEq(startBlock, 0);
        assertTrue(isExpired); // deadline (0) <= block.number

        // After ack
        _doAck(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);

        (currentBlock, expiryBlock, startBlock, graceStartsAt, timeLeft, isExpired) =
            walletRegistry.getDeadlines(wallet);

        assertEq(currentBlock, block.number);
        assertGt(expiryBlock, block.number);
        assertGt(startBlock, block.number);
        assertGt(graceStartsAt, 0);
        assertGt(timeLeft, 0);
        assertFalse(isExpired);
    }

    /// @notice quoteRegistration returns 0 when no fee manager is set
    function test_QuoteRegistration_ZeroFeeManager() public view {
        uint256 fee = walletRegistry.quoteRegistration(wallet);
        assertEq(fee, 0);
    }

    /// @notice quoteFeeBreakdown returns zero breakdown with no fee manager
    function test_QuoteFeeBreakdown_ZeroFeeManager() public view {
        IWalletRegistry.FeeBreakdown memory breakdown = walletRegistry.quoteFeeBreakdown(wallet);
        assertEq(breakdown.bridgeFee, 0);
        assertEq(breakdown.registrationFee, 0);
        assertEq(breakdown.total, 0);
        assertEq(bytes(breakdown.bridgeName).length, 0);
    }

    /// @notice isWalletRegistered(string) via CAIP-10 string matches address-based lookup
    function test_IsWalletRegistered_CAIP10StringLookup() public {
        _doFullRegistration(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);

        // Build CAIP-10 wildcard string: eip155:_:0x{address}
        string memory caip10 = CAIP10Evm.formatEvmWildcardLower(wallet);
        assertTrue(walletRegistry.isWalletRegistered(caip10));
        assertTrue(walletRegistry.isWalletRegistered(wallet));
    }

    /// @notice getWalletEntry(string) via CAIP-10 string returns the same data as address overload
    function test_GetWalletEntry_CAIP10StringLookup() public {
        _doFullRegistration(forwarder, REPORTED_CHAIN_ID, incidentTimestamp);

        IWalletRegistry.WalletEntry memory byAddr = walletRegistry.getWalletEntry(wallet);
        IWalletRegistry.WalletEntry memory byStr =
            walletRegistry.getWalletEntry(CAIP10Evm.formatEvmWildcardLower(wallet));

        assertEq(byAddr.registeredAt, byStr.registeredAt);
        assertEq(byAddr.batchId, byStr.batchId);
        assertEq(byAddr.incidentTimestamp, byStr.incidentTimestamp);
    }

    /// @notice batchCount returns 0 initially
    function test_BatchCount_InitiallyZero() public view {
        assertEq(walletRegistry.batchCount(), 0);
    }

    /// @notice isWalletPending returns false for unacknowledged wallet
    function test_IsWalletPending_FalseForUnknown() public view {
        assertFalse(walletRegistry.isWalletPending(wallet));
    }

    /// @notice isWalletRegistered returns false for unregistered wallet
    function test_IsWalletRegistered_FalseForUnknown() public view {
        assertFalse(walletRegistry.isWalletRegistered(wallet));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can set hub, emits HubUpdated
    function test_SetHub_Success() public {
        address newHub = makeAddr("newHub");
        address oldHub = walletRegistry.hub();

        vm.expectEmit(false, false, false, true);
        emit HubUpdated(oldHub, newHub);

        walletRegistry.setHub(newHub);
        assertEq(walletRegistry.hub(), newHub);
    }

    /// @notice Non-owner cannot set hub
    function test_SetHub_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.prank(nonOwner);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        walletRegistry.setHub(makeAddr("newHub"));
    }

    /// @notice setHub rejects address(0)
    function test_SetHub_RejectsZeroAddress() public {
        vm.expectRevert(IWalletRegistry.WalletRegistry__ZeroAddress.selector);
        walletRegistry.setHub(address(0));
    }

    /// @notice Owner can set operator submitter, emits OperatorSubmitterUpdated
    function test_SetOperatorSubmitter_Success() public {
        address newSubmitter = makeAddr("newSubmitter");
        address oldSubmitter = walletRegistry.operatorSubmitter();

        vm.expectEmit(false, false, false, true);
        emit OperatorSubmitterUpdated(oldSubmitter, newSubmitter);

        walletRegistry.setOperatorSubmitter(newSubmitter);
        assertEq(walletRegistry.operatorSubmitter(), newSubmitter);
    }

    /// @notice setOperatorSubmitter rejects address(0)
    function test_SetOperatorSubmitter_RejectsZeroAddress() public {
        vm.expectRevert(IWalletRegistry.WalletRegistry__ZeroAddress.selector);
        walletRegistry.setOperatorSubmitter(address(0));
    }

    /// @notice Non-owner cannot set operator submitter
    function test_SetOperatorSubmitter_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.prank(nonOwner);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        walletRegistry.setOperatorSubmitter(makeAddr("newSubmitter"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE RECOVERY (Hub Not Configured)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice When feeManager is set but hub is not configured yet, required fee is held in the registry
    ///         and can be recovered via withdrawCollectedFees().
    function test_FeesHeldWhenHubUnset_CanWithdraw() public {
        // Deploy fee infra
        MockAggregator oracle = new MockAggregator(300_000_000_000); // $3000 (8 decimals)
        FeeManager fm = new FeeManager(owner, address(oracle));

        // Deploy a fresh wallet registry with feeManager and NO hub set
        WalletRegistry feeRegistry = new WalletRegistry(owner, address(fm), GRACE_BLOCKS, DEADLINE_BLOCKS);

        uint64 ts = uint64(block.timestamp - 1 days);

        // Ack + advance past grace
        {
            uint256 deadline0 = block.timestamp + 1 hours;
            uint256 nonce0 = feeRegistry.nonces(wallet);
            (uint8 v0, bytes32 r0, bytes32 s0) = _signWalletAck(
                walletPrivateKey, address(feeRegistry), wallet, forwarder, REPORTED_CHAIN_ID, ts, nonce0, deadline0
            );
            vm.prank(forwarder);
            feeRegistry.acknowledge(wallet, forwarder, REPORTED_CHAIN_ID, ts, deadline0, nonce0, v0, r0, s0);
        }

        IWalletRegistry.AcknowledgementData memory ack = feeRegistry.getAcknowledgementData(wallet);
        vm.roll(ack.gracePeriodStart);

        // Register with exact required fee
        uint256 fee = fm.currentFeeWei();
        {
            uint256 deadline1 = block.timestamp + 1 hours;
            uint256 nonce1 = feeRegistry.nonces(wallet);
            (uint8 v1, bytes32 r1, bytes32 s1) = _signWalletReg(
                walletPrivateKey, address(feeRegistry), wallet, forwarder, REPORTED_CHAIN_ID, ts, nonce1, deadline1
            );

            vm.deal(forwarder, fee);
            vm.prank(forwarder);
            feeRegistry.register{ value: fee }(wallet, forwarder, REPORTED_CHAIN_ID, ts, deadline1, nonce1, v1, r1, s1);
        }

        // Fee should be held by the registry since hub is unset
        assertEq(address(feeRegistry).balance, fee);

        // Owner can withdraw
        uint256 ownerBefore = owner.balance;
        feeRegistry.withdrawCollectedFees();
        assertEq(address(feeRegistry).balance, 0);
        assertEq(owner.balance - ownerBefore, fee);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH SIZE LIMIT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice registerWalletsFromOperator reverts when batch exceeds MAX_BATCH_SIZE
    function test_RegisterFromOperator_RejectsBatchTooLarge() public {
        address opSubmitter = makeAddr("batchLimitSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        uint256 tooMany = walletRegistry.MAX_BATCH_SIZE() + 1;
        bytes32[] memory identifiers = new bytes32[](tooMany);
        bytes32[] memory chainIds = new bytes32[](tooMany);
        uint64[] memory timestamps = new uint64[](tooMany);

        // Don't need to populate — the length check fires before the loop
        vm.expectRevert(IWalletRegistry.WalletRegistry__BatchTooLarge.selector);
        vm.prank(opSubmitter);
        walletRegistry.registerWalletsFromOperator(keccak256("op"), identifiers, chainIds, timestamps);
    }

    /// @notice MAX_BATCH_SIZE is 10_000
    function test_MaxBatchSizeValue() public view {
        assertEq(walletRegistry.MAX_BATCH_SIZE(), 10_000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WITHDRAW TO
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice withdrawTo sends balance to specified recipient and emits FeesWithdrawn
    function test_WithdrawTo_Success() public {
        // Seed the registry with some ETH
        vm.deal(address(walletRegistry), 1 ether);

        address recipient = makeAddr("feeRecipient");
        uint256 recipientBefore = recipient.balance;

        vm.expectEmit(true, false, false, true);
        emit IWalletRegistry.FeesWithdrawn(recipient, 1 ether);

        walletRegistry.withdrawTo(recipient);

        assertEq(address(walletRegistry).balance, 0);
        assertEq(recipient.balance - recipientBefore, 1 ether);
    }

    /// @notice withdrawTo rejects zero address
    function test_WithdrawTo_RejectsZeroAddress() public {
        vm.deal(address(walletRegistry), 1 ether);

        vm.expectRevert(IWalletRegistry.WalletRegistry__ZeroAddress.selector);
        walletRegistry.withdrawTo(address(0));
    }

    /// @notice withdrawTo is a no-op when balance is zero
    function test_WithdrawTo_NoOpWhenEmpty() public {
        address recipient = makeAddr("emptyRecipient");
        // Should not revert, just return
        walletRegistry.withdrawTo(recipient);
        assertEq(recipient.balance, 0);
    }

    /// @notice Non-owner cannot call withdrawTo
    function test_WithdrawTo_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.deal(address(walletRegistry), 1 ether);

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        walletRegistry.withdrawTo(makeAddr("any"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STORAGE SLOT INVARIANT — WalletEntry MUST fit in 1 slot
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice WalletEntry fits in exactly 1 storage slot (no overflow to next slot).
    /// @dev Uses vm.record()/vm.accesses() to discover the entry's storage slot dynamically
    ///      (no hardcoded mapping slot index). A single-slot struct triggers exactly 1 SLOAD
    ///      in the getter; a multi-slot struct would trigger more.
    function test_WalletEntryFitsInOneSlot() public {
        // Register a wallet via operator path
        address opSubmitter = makeAddr("slotTestSubmitter");
        walletRegistry.setOperatorSubmitter(opSubmitter);

        address testWallet = makeAddr("slotTestWallet");
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = bytes32(uint256(uint160(testWallet)));
        bytes32[] memory reportedChainIds = new bytes32[](1);
        reportedChainIds[0] = CAIP10Evm.caip2Hash(REPORTED_CHAIN_ID);
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = incidentTimestamp;

        vm.prank(opSubmitter);
        walletRegistry.registerWalletsFromOperator(keccak256("op"), identifiers, reportedChainIds, timestamps);

        // Record storage reads when fetching the entry — reveals which slot(s) the struct occupies
        vm.record();
        walletRegistry.getWalletEntry(testWallet);
        (bytes32[] memory reads,) = vm.accesses(address(walletRegistry));

        // A single-slot entry triggers exactly 1 SLOAD
        assertEq(reads.length, 1, "WalletEntry should occupy exactly 1 storage slot");

        // Verify the slot is populated
        bytes32 packed = vm.load(address(walletRegistry), reads[0]);
        assertNotEq(packed, bytes32(0), "WalletEntry should be populated");

        // Next slot must be empty — proves no overflow to a second slot
        bytes32 nextSlot = bytes32(uint256(reads[0]) + 1);
        assertEq(vm.load(address(walletRegistry), nextSlot), bytes32(0), "WalletEntry overflowed to second slot");
    }
}
