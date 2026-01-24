// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";

/// @title StolenWalletRegistryTest
/// @notice Comprehensive unit and fuzz tests for StolenWalletRegistry
contract StolenWalletRegistryTest is EIP712TestHelper {
    StolenWalletRegistry public registry;

    // Test accounts
    uint256 internal ownerPrivateKey;
    address internal owner;
    address internal forwarder;

    // Timing configuration (matching local Anvil - 13s blocks)
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        // Deploy registry without fee collection for base tests
        registry = new StolenWalletRegistry(address(this), address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Create test accounts with known private key for signing
        ownerPrivateKey = 0xA11CE;
        owner = vm.addr(ownerPrivateKey);
        forwarder = makeAddr("forwarder");

        // Fund accounts
        vm.deal(owner, 10 ether);
        vm.deal(forwarder, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _doAcknowledgement(address _forwarder) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), owner, _forwarder, nonce, deadline);

        vm.prank(_forwarder);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    function _skipToRegistrationWindow() internal {
        // Get deadlines and skip to after grace period starts
        (,, uint256 startBlock,,,) = registry.getDeadlines(owner);
        vm.roll(startBlock + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Acknowledgement should succeed and set pending state.
    function test_Acknowledge_Success() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletAcknowledged(owner, forwarder, true);

        vm.prank(forwarder);
        registry.acknowledge(deadline, nonce, owner, v, r, s);

        // Verify state changes
        assertTrue(registry.isPending(owner), "Should be pending");
        assertFalse(registry.isRegistered(owner), "Should not be registered yet");
        assertEq(registry.nonces(owner), 1, "Nonce should increment");

        // Verify acknowledgement data
        IStolenWalletRegistry.AcknowledgementData memory ack = registry.getAcknowledgement(owner);
        assertEq(ack.trustedForwarder, forwarder, "Forwarder should match");
        assertGt(ack.startBlock, block.number, "Start block should be in future");
        assertGt(ack.expiryBlock, ack.startBlock, "Expiry should be after start");
    }

    // Self-relay acknowledgement should set isSponsored to false.
    function test_Acknowledge_SelfRelay() public {
        // Owner is also the forwarder (not sponsored)
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), owner, owner, nonce, deadline);

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletAcknowledged(owner, owner, false); // isSponsored = false

        vm.prank(owner);
        registry.acknowledge(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isPending(owner));
    }

    // Acknowledgement should reject expired signatures.
    function test_Acknowledge_ExpiredDeadline() public {
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Acknowledgement__Expired.selector);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    // Acknowledgement should reject incorrect nonce.
    function test_Acknowledge_InvalidNonce() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), owner, forwarder, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidNonce.selector);
        registry.acknowledge(deadline, wrongNonce, owner, v, r, s);
    }

    // Acknowledgement should reject signatures not from owner.
    function test_Acknowledge_InvalidSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        // Sign with wrong private key
        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signWalletAck(wrongKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Acknowledgement__InvalidSigner.selector);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    // Acknowledgement should fail for already registered wallets.
    function test_Acknowledge_AlreadyRegistered() public {
        // Complete full registration first
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner), "Should be registered");

        // Try to acknowledge again
        nonce = registry.nonces(owner);
        (v, r, s) = _signWalletAck(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.AlreadyRegistered.selector);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    // Acknowledgement should reject zero owner address.
    function test_Acknowledge_ZeroAddress() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        // Sign for zero address (will fail validation anyway, but test the explicit check)
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), address(0), forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidOwner.selector);
        registry.acknowledge(deadline, nonce, address(0), v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Registration should succeed after grace period and clear pending state.
    function test_Register_Success() public {
        _doAcknowledgement(forwarder);

        uint256 nonceBeforeReg = registry.nonces(owner);
        assertEq(nonceBeforeReg, 1, "Nonce should be 1 after ACK");

        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletRegistered(owner, true);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        // Verify state changes
        assertTrue(registry.isRegistered(owner), "Should be registered");
        assertFalse(registry.isPending(owner), "Should not be pending");
        assertEq(registry.nonces(owner), 2, "Nonce should be 2 after REG");

        // Verify registration data
        IStolenWalletRegistry.RegistrationData memory reg = registry.getRegistration(owner);
        assertEq(reg.registeredAt, uint64(block.number), "Registered at current block");
        assertEq(reg.sourceChainId, uint32(block.chainid), "Source chain is current chain");
        assertEq(reg.bridgeId, uint8(IStolenWalletRegistry.BridgeId.NONE), "No bridge for native");
        assertTrue(reg.isSponsored, "Should be sponsored");
        assertEq(reg.crossChainMessageId, bytes32(0), "No bridge message for native");
    }

    // Self-relay registration should set isSponsored to false.
    function test_Register_SelfRelay() public {
        // Owner is forwarder
        _doAcknowledgement(owner);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, owner, nonce, deadline);

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletRegistered(owner, false); // Not sponsored

        vm.prank(owner);
        registry.register(deadline, nonce, owner, v, r, s);

        IStolenWalletRegistry.RegistrationData memory reg = registry.getRegistration(owner);
        assertFalse(reg.isSponsored, "Should not be sponsored");
    }

    // Registration should fail before grace period starts.
    function test_Register_BeforeGracePeriod() public {
        _doAcknowledgement(forwarder);

        // Try to register immediately (before grace period)
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__GracePeriodNotStarted.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    // Registration should fail after the registration window expires.
    function test_Register_AfterExpiry() public {
        _doAcknowledgement(forwarder);

        // Get expiry and roll past it
        (, uint256 expiryBlock,,,,) = registry.getDeadlines(owner);
        vm.roll(expiryBlock + 1);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__ForwarderExpired.selector);
        registry.register(deadline, nonce, owner, v, r, s);

        // Note: Acknowledgement is NOT deleted because revert rolls back state changes.
        // The isPending() check correctly returns false due to expiry check.
        assertFalse(registry.isPending(owner), "Should not be pending (expired)");
    }

    // Registration should fail if caller is not trusted forwarder.
    function test_Register_WrongForwarder() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrongForwarder");
        vm.deal(wrongForwarder, 1 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        // Sign with correct owner but for wrong forwarder
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, wrongForwarder, nonce, deadline);

        vm.prank(wrongForwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__InvalidForwarder.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    // Registration should reject expired signatures.
    function test_Register_ExpiredDeadline() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp - 1; // Expired
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__SignatureExpired.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    // Registration should reject incorrect nonce.
    function test_Register_InvalidNonce() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidNonce.selector);
        registry.register(deadline, wrongNonce, owner, v, r, s);
    }

    // Registration should reject signatures not from owner.
    function test_Register_InvalidSigner() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signWalletReg(wrongKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__InvalidSigner.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    // Registration should reject zero owner address.
    function test_Register_ZeroAddress() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        // Sign for zero address (will fail validation anyway, but test the explicit check)
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), address(0), forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidOwner.selector);
        registry.register(deadline, nonce, address(0), v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // isRegistered should return true after registration.
    function test_IsRegistered_True() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner));
    }

    // isRegistered should return false before registration.
    function test_IsRegistered_False() public {
        assertFalse(registry.isRegistered(owner));
    }

    // isPending should return true after acknowledgement.
    function test_IsPending_True() public {
        _doAcknowledgement(forwarder);
        assertTrue(registry.isPending(owner));
    }

    // isPending should return false with no acknowledgement.
    function test_IsPending_False_NoPending() public {
        assertFalse(registry.isPending(owner));
    }

    // isPending should return false after expiry.
    function test_IsPending_False_Expired() public {
        _doAcknowledgement(forwarder);

        // Roll past expiry
        (, uint256 expiryBlock,,,,) = registry.getDeadlines(owner);
        vm.roll(expiryBlock + 1);

        assertFalse(registry.isPending(owner));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NONCE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Nonce should increment on acknowledgement and registration.
    function test_NonceIncrements_BothPhases() public {
        assertEq(registry.nonces(owner), 0, "Initial nonce should be 0");

        _doAcknowledgement(forwarder);
        assertEq(registry.nonces(owner), 1, "Nonce should be 1 after ACK");

        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertEq(registry.nonces(owner), 2, "Nonce should be 2 after REG");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FRONTEND COMPATIBILITY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // generateHashStruct should produce acknowledgement hash for step 1.
    function test_GenerateHashStruct_Step1() public {
        vm.prank(owner);
        (uint256 deadline, bytes32 hashStruct) = registry.generateHashStruct(forwarder, 1);

        assertGt(deadline, block.timestamp, "Deadline should be in future");

        // Verify hash struct is correctly computed (statement is hashed per EIP-712)
        uint256 nonce = registry.nonces(owner);
        bytes32 expectedHash = keccak256(
            abi.encode(WALLET_ACK_TYPEHASH, keccak256(bytes(WALLET_ACK_STATEMENT)), owner, forwarder, nonce, deadline)
        );
        assertEq(hashStruct, expectedHash, "Hash struct should match");
    }

    // generateHashStruct should produce registration hash for step 2.
    function test_GenerateHashStruct_Step2() public {
        vm.prank(owner);
        (uint256 deadline, bytes32 hashStruct) = registry.generateHashStruct(forwarder, 2);

        assertGt(deadline, block.timestamp, "Deadline should be in future");

        // Verify hash struct is correctly computed (statement is hashed per EIP-712)
        uint256 nonce = registry.nonces(owner);
        bytes32 expectedHash = keccak256(
            abi.encode(WALLET_REG_TYPEHASH, keccak256(bytes(WALLET_REG_STATEMENT)), owner, forwarder, nonce, deadline)
        );
        assertEq(hashStruct, expectedHash, "Hash struct should match");
    }

    // Non-1 steps should default to registration hash.
    function test_GenerateHashStruct_InvalidStep_DefaultsToRegistration() public {
        // Any step value other than 1 defaults to registration typehash
        // This is by design - see IStolenWalletRegistry.generateHashStruct docs
        vm.prank(owner);
        (, bytes32 hashStructStep0) = registry.generateHashStruct(forwarder, 0);

        vm.prank(owner);
        (, bytes32 hashStructStep2) = registry.generateHashStruct(forwarder, 2);

        vm.prank(owner);
        (, bytes32 hashStructStep255) = registry.generateHashStruct(forwarder, 255);

        // All non-1 steps should produce same hash (registration typehash)
        assertEq(hashStructStep0, hashStructStep2, "Step 0 and 2 should match");
        assertEq(hashStructStep2, hashStructStep255, "Step 2 and 255 should match");

        // Verify these are different from step 1 (acknowledgement)
        vm.prank(owner);
        (, bytes32 hashStructStep1) = registry.generateHashStruct(forwarder, 1);
        assertTrue(hashStructStep1 != hashStructStep2, "Step 1 should differ from step 2");
    }

    // getDeadlines should report active window values after acknowledgement.
    function test_GetDeadlines_Active() public {
        _doAcknowledgement(forwarder);

        (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        ) = registry.getDeadlines(owner);

        assertEq(currentBlock, block.number, "Current block should match");
        assertGt(expiryBlock, block.number, "Expiry should be in future");
        assertGt(startBlock, block.number, "Start should be in future");
        assertGt(graceStartsAt, 0, "Grace starts at should be > 0");
        assertGt(timeLeft, 0, "Time left should be > 0");
        assertFalse(isExpired, "Should not be expired");
    }

    // getDeadlines should report expired after deadline passes.
    function test_GetDeadlines_Expired() public {
        _doAcknowledgement(forwarder);

        (, uint256 expiryBlock,,,,) = registry.getDeadlines(owner);
        vm.roll(expiryBlock + 1);

        (,,,, uint256 timeLeft, bool isExpired) = registry.getDeadlines(owner);

        assertEq(timeLeft, 0, "Time left should be 0");
        assertTrue(isExpired, "Should be expired");
    }

    // getDeadlines should show graceStartsAt=0 after grace period.
    function test_GetDeadlines_AfterGracePeriod() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        (,,, uint256 graceStartsAt,,) = registry.getDeadlines(owner);

        assertEq(graceStartsAt, 0, "Grace starts at should be 0 after grace period");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fuzz test: for valid signatures across a wide keyspace, acknowledgements
    // should succeed and increment nonces as expected.
    function testFuzz_Acknowledge_ValidSignature(uint256 privateKey) public {
        // Bound private key to valid range (1 to secp256k1 order - 1)
        privateKey = bound(privateKey, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);

        address fuzzOwner = vm.addr(privateKey);
        vm.deal(fuzzOwner, 1 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(fuzzOwner);

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(privateKey, address(registry), fuzzOwner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.acknowledge(deadline, nonce, fuzzOwner, v, r, s);

        assertTrue(registry.isPending(fuzzOwner));
        assertEq(registry.nonces(fuzzOwner), 1);
    }

    // Fuzz test: registration should succeed when executed within the valid
    // grace/expiry window for many timing offsets.
    function testFuzz_Register_TimingWindow(uint256 blocksAfterStart) public {
        _doAcknowledgement(forwarder);

        (, uint256 expiryBlock, uint256 startBlock,,,) = registry.getDeadlines(owner);

        // Bound to valid registration window
        blocksAfterStart = bound(blocksAfterStart, 0, expiryBlock - startBlock - 1);

        vm.roll(startBlock + blocksAfterStart);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner));
    }

    // Fuzz test: nonces should never decrease across repeated acknowledgements,
    // even after expiry rollovers.
    function testFuzz_Nonces_NeverDecrease(uint8 numOperations) public {
        // Limit operations to prevent timeout
        numOperations = uint8(bound(numOperations, 1, 10));

        uint256 previousNonce = registry.nonces(owner);

        for (uint8 i = 0; i < numOperations; i++) {
            // Do acknowledgement
            uint256 deadline = block.timestamp + 1 hours;
            uint256 nonce = registry.nonces(owner);
            (uint8 v, bytes32 r, bytes32 s) =
                _signWalletAck(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

            vm.prank(forwarder);
            registry.acknowledge(deadline, nonce, owner, v, r, s);

            uint256 currentNonce = registry.nonces(owner);
            assertGe(currentNonce, previousNonce, "Nonce should never decrease");
            previousNonce = currentNonce;

            // Skip past expiry to allow new acknowledgement
            (, uint256 expiryBlock,,,,) = registry.getDeadlines(owner);
            vm.roll(expiryBlock + 1);
            vm.warp(block.timestamp + 1 hours);
        }
    }
}

/// @title StolenWalletRegistryFeeTest
/// @notice Tests for fee validation in StolenWalletRegistry
contract StolenWalletRegistryFeeTest is EIP712TestHelper {
    StolenWalletRegistry public registry;
    FeeManager public feeManager;
    RegistryHub public hub;
    MockAggregator public mockOracle;

    // Test accounts
    uint256 internal ownerPrivateKey;
    address internal owner;
    address internal forwarder;
    address internal deployer;

    // Timing configuration (matching local Anvil - 13s blocks)
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        deployer = makeAddr("deployer");
        ownerPrivateKey = 0xA11CE;
        owner = vm.addr(ownerPrivateKey);
        forwarder = makeAddr("forwarder");

        vm.deal(owner, 10 ether);
        vm.deal(forwarder, 10 ether);

        // Deploy with fee collection enabled
        vm.startPrank(deployer);
        mockOracle = new MockAggregator(300_000_000_000); // $3000 ETH
        feeManager = new FeeManager(deployer, address(mockOracle));
        hub = new RegistryHub(deployer, address(feeManager), address(0));
        registry =
            new StolenWalletRegistry(address(this), address(feeManager), address(hub), GRACE_BLOCKS, DEADLINE_BLOCKS);
        hub.setRegistry(hub.STOLEN_WALLET(), address(registry));
        vm.stopPrank();
    }

    function _doAcknowledgement() internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    function _skipToRegistrationWindow() internal {
        (,, uint256 startBlock,,,) = registry.getDeadlines(owner);
        vm.roll(startBlock + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE VALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Registration should succeed when paid exact required fee.
    function test_Register_WithCorrectFee_Succeeds() public {
        _doAcknowledgement();
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 fee = feeManager.currentFeeWei();

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register{ value: fee }(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner));
    }

    // Registration should revert when payment is below required fee.
    function test_Register_WithInsufficientFee_Reverts() public {
        _doAcknowledgement();
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 fee = feeManager.currentFeeWei();
        uint256 insufficientFee = fee - 1;

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__InsufficientFee.selector);
        registry.register{ value: insufficientFee }(deadline, nonce, owner, v, r, s);
    }

    // Registration should succeed with overpayment.
    function test_Register_WithExcessFee_Succeeds() public {
        _doAcknowledgement();
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 fee = feeManager.currentFeeWei();
        uint256 excessFee = fee * 2; // Double the required fee

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register{ value: excessFee }(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner));
    }

    // Fee bypass: when no fee manager is configured, registration should
    // succeed without sending any ETH. This preserves free-mode deployments.
    function test_Register_NoFeeManager_Free() public {
        // Deploy registry without fee manager
        StolenWalletRegistry freeRegistry =
            new StolenWalletRegistry(address(this), address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = freeRegistry.nonces(owner);

        // Sign for the free registry using helper
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(ownerPrivateKey, address(freeRegistry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        freeRegistry.acknowledge(deadline, nonce, owner, v, r, s);

        // Skip to registration window
        (,, uint256 startBlock,,,) = freeRegistry.getDeadlines(owner);
        vm.roll(startBlock + 1);

        // Register without fee
        deadline = block.timestamp + 1 hours;
        nonce = freeRegistry.nonces(owner);
        (v, r, s) = _signWalletReg(ownerPrivateKey, address(freeRegistry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        freeRegistry.register(deadline, nonce, owner, v, r, s); // No value sent

        assertTrue(freeRegistry.isRegistered(owner));
    }

    // Fee forwarding is critical for revenue collection. This test verifies
    // the full fee amount is transferred to the hub on registration.
    function test_Register_FeeForwardedToHub() public {
        _doAcknowledgement();
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 fee = feeManager.currentFeeWei();

        uint256 hubBalanceBefore = address(hub).balance;

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register{ value: fee }(deadline, nonce, owner, v, r, s);

        uint256 hubBalanceAfter = address(hub).balance;
        assertEq(hubBalanceAfter - hubBalanceBefore, fee, "Hub should receive full fee");
    }

    // Hub receives ETH and should be able to withdraw via owner-only path,
    // validating the full fee lifecycle.
    function test_Register_HubReceivesETH() public {
        _doAcknowledgement();
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 fee = feeManager.currentFeeWei();

        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletReg(ownerPrivateKey, address(registry), owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register{ value: fee }(deadline, nonce, owner, v, r, s);

        // Verify hub received ETH
        assertEq(address(hub).balance, fee, "Hub balance should equal fee");

        // Owner can withdraw from hub
        vm.prank(deployer);
        hub.withdrawFees(deployer, fee);
        assertEq(deployer.balance, fee, "Deployer should receive withdrawn fee");
    }

    // Registry should store zero fee manager and hub when free.
    function test_Register_ZeroFeeWhenNoFeeManager() public {
        // Deploy registry without fee manager
        StolenWalletRegistry freeRegistry =
            new StolenWalletRegistry(address(this), address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        assertEq(freeRegistry.feeManager(), address(0));
        assertEq(freeRegistry.registryHub(), address(0));
    }

    // Constructor should store fee manager and hub addresses.
    function test_Constructor_StoresFeeManagerAndHub() public view {
        assertEq(registry.feeManager(), address(feeManager));
        assertEq(registry.registryHub(), address(hub));
    }
}
