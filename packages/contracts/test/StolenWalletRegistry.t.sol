// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";

/// @title StolenWalletRegistryTest
/// @notice Comprehensive unit and fuzz tests for StolenWalletRegistry
contract StolenWalletRegistryTest is Test {
    StolenWalletRegistry public registry;

    // Test accounts
    uint256 internal ownerPrivateKey;
    address internal owner;
    address internal forwarder;

    // EIP-712 constants (must match contract)
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    bytes32 private constant REGISTRATION_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    // Domain separator components
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        registry = new StolenWalletRegistry();

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

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(TYPE_HASH, keccak256("StolenWalletRegistry"), keccak256("4"), block.chainid, address(registry))
        );
    }

    function _signAcknowledgement(
        uint256 privateKey,
        address _owner,
        address _forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(ACKNOWLEDGEMENT_TYPEHASH, _owner, _forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _signRegistration(uint256 privateKey, address _owner, address _forwarder, uint256 nonce, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(REGISTRATION_TYPEHASH, _owner, _forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _doAcknowledgement(address _forwarder) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, owner, _forwarder, nonce, deadline);

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

    function test_Acknowledge_Success() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, owner, forwarder, nonce, deadline);

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

    function test_Acknowledge_SelfRelay() public {
        // Owner is also the forwarder (not sponsored)
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, owner, owner, nonce, deadline);

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletAcknowledged(owner, owner, false); // isSponsored = false

        vm.prank(owner);
        registry.acknowledge(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isPending(owner));
    }

    function test_Acknowledge_ExpiredDeadline() public {
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = registry.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Acknowledgement__Expired.selector);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    function test_Acknowledge_InvalidNonce() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, owner, forwarder, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidNonce.selector);
        registry.acknowledge(deadline, wrongNonce, owner, v, r, s);
    }

    function test_Acknowledge_InvalidSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);

        // Sign with wrong private key
        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(wrongKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Acknowledgement__InvalidSigner.selector);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    function test_Acknowledge_AlreadyRegistered() public {
        // Complete full registration first
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner), "Should be registered");

        // Try to acknowledge again
        nonce = registry.nonces(owner);
        (v, r, s) = _signAcknowledgement(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.AlreadyRegistered.selector);
        registry.acknowledge(deadline, nonce, owner, v, r, s);
    }

    function test_Acknowledge_ZeroAddress() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        // Sign for zero address (will fail validation anyway, but test the explicit check)
        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, address(0), forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidOwner.selector);
        registry.acknowledge(deadline, nonce, address(0), v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Register_Success() public {
        _doAcknowledgement(forwarder);

        uint256 nonceBeforeReg = registry.nonces(owner);
        assertEq(nonceBeforeReg, 1, "Nonce should be 1 after ACK");

        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

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
        assertEq(reg.registeredAt, block.number, "Registered at current block");
        assertEq(reg.registeredBy, forwarder, "Registered by forwarder");
        assertTrue(reg.isSponsored, "Should be sponsored");
    }

    function test_Register_SelfRelay() public {
        // Owner is forwarder
        _doAcknowledgement(owner);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, owner, nonce, deadline);

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletRegistered(owner, false); // Not sponsored

        vm.prank(owner);
        registry.register(deadline, nonce, owner, v, r, s);

        IStolenWalletRegistry.RegistrationData memory reg = registry.getRegistration(owner);
        assertFalse(reg.isSponsored, "Should not be sponsored");
    }

    function test_Register_BeforeGracePeriod() public {
        _doAcknowledgement(forwarder);

        // Try to register immediately (before grace period)
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__GracePeriodNotStarted.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    function test_Register_AfterExpiry() public {
        _doAcknowledgement(forwarder);

        // Get expiry and roll past it
        (, uint256 expiryBlock,,,,) = registry.getDeadlines(owner);
        vm.roll(expiryBlock + 1);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__ForwarderExpired.selector);
        registry.register(deadline, nonce, owner, v, r, s);

        // Note: Acknowledgement is NOT deleted because revert rolls back state changes.
        // The isPending() check correctly returns false due to expiry check.
        assertFalse(registry.isPending(owner), "Should not be pending (expired)");
    }

    function test_Register_WrongForwarder() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrongForwarder");
        vm.deal(wrongForwarder, 1 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        // Sign with correct owner but for wrong forwarder
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, wrongForwarder, nonce, deadline);

        vm.prank(wrongForwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__InvalidForwarder.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    function test_Register_ExpiredDeadline() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp - 1; // Expired
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__SignatureExpired.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    function test_Register_InvalidNonce() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidNonce.selector);
        registry.register(deadline, wrongNonce, owner, v, r, s);
    }

    function test_Register_InvalidSigner() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(wrongKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.Registration__InvalidSigner.selector);
        registry.register(deadline, nonce, owner, v, r, s);
    }

    function test_Register_ZeroAddress() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 0;

        // Sign for zero address (will fail validation anyway, but test the explicit check)
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, address(0), forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.InvalidOwner.selector);
        registry.register(deadline, nonce, address(0), v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_IsRegistered_True() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner));
    }

    function test_IsRegistered_False() public {
        assertFalse(registry.isRegistered(owner));
    }

    function test_IsPending_True() public {
        _doAcknowledgement(forwarder);
        assertTrue(registry.isPending(owner));
    }

    function test_IsPending_False_NoPending() public {
        assertFalse(registry.isPending(owner));
    }

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

    function test_NonceIncrements_BothPhases() public {
        assertEq(registry.nonces(owner), 0, "Initial nonce should be 0");

        _doAcknowledgement(forwarder);
        assertEq(registry.nonces(owner), 1, "Nonce should be 1 after ACK");

        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertEq(registry.nonces(owner), 2, "Nonce should be 2 after REG");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FRONTEND COMPATIBILITY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_GenerateHashStruct_Step1() public {
        vm.prank(owner);
        (uint256 deadline, bytes32 hashStruct) = registry.generateHashStruct(forwarder, 1);

        assertGt(deadline, block.timestamp, "Deadline should be in future");

        // Verify hash struct is correctly computed
        uint256 nonce = registry.nonces(owner);
        bytes32 expectedHash = keccak256(abi.encode(ACKNOWLEDGEMENT_TYPEHASH, owner, forwarder, nonce, deadline));
        assertEq(hashStruct, expectedHash, "Hash struct should match");
    }

    function test_GenerateHashStruct_Step2() public {
        vm.prank(owner);
        (uint256 deadline, bytes32 hashStruct) = registry.generateHashStruct(forwarder, 2);

        assertGt(deadline, block.timestamp, "Deadline should be in future");

        // Verify hash struct is correctly computed
        uint256 nonce = registry.nonces(owner);
        bytes32 expectedHash = keccak256(abi.encode(REGISTRATION_TYPEHASH, owner, forwarder, nonce, deadline));
        assertEq(hashStruct, expectedHash, "Hash struct should match");
    }

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

    function test_GetDeadlines_Expired() public {
        _doAcknowledgement(forwarder);

        (, uint256 expiryBlock,,,,) = registry.getDeadlines(owner);
        vm.roll(expiryBlock + 1);

        (,,,, uint256 timeLeft, bool isExpired) = registry.getDeadlines(owner);

        assertEq(timeLeft, 0, "Time left should be 0");
        assertTrue(isExpired, "Should be expired");
    }

    function test_GetDeadlines_AfterGracePeriod() public {
        _doAcknowledgement(forwarder);
        _skipToRegistrationWindow();

        (,,, uint256 graceStartsAt,,) = registry.getDeadlines(owner);

        assertEq(graceStartsAt, 0, "Grace starts at should be 0 after grace period");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function testFuzz_Acknowledge_ValidSignature(uint256 privateKey) public {
        // Bound private key to valid range (1 to secp256k1 order - 1)
        privateKey = bound(privateKey, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);

        address fuzzOwner = vm.addr(privateKey);
        vm.deal(fuzzOwner, 1 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(fuzzOwner);

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(privateKey, fuzzOwner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.acknowledge(deadline, nonce, fuzzOwner, v, r, s);

        assertTrue(registry.isPending(fuzzOwner));
        assertEq(registry.nonces(fuzzOwner), 1);
    }

    function testFuzz_Register_TimingWindow(uint256 blocksAfterStart) public {
        _doAcknowledgement(forwarder);

        (, uint256 expiryBlock, uint256 startBlock,,,) = registry.getDeadlines(owner);

        // Bound to valid registration window
        blocksAfterStart = bound(blocksAfterStart, 0, expiryBlock - startBlock - 1);

        vm.roll(startBlock + blocksAfterStart);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(ownerPrivateKey, owner, forwarder, nonce, deadline);

        vm.prank(forwarder);
        registry.register(deadline, nonce, owner, v, r, s);

        assertTrue(registry.isRegistered(owner));
    }

    function testFuzz_Nonces_NeverDecrease(uint8 numOperations) public {
        // Limit operations to prevent timeout
        numOperations = uint8(bound(numOperations, 1, 10));

        uint256 previousNonce = registry.nonces(owner);

        for (uint8 i = 0; i < numOperations; i++) {
            // Do acknowledgement
            uint256 deadline = block.timestamp + 1 hours;
            uint256 nonce = registry.nonces(owner);
            (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(ownerPrivateKey, owner, forwarder, nonce, deadline);

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
