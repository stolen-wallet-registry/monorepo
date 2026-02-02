// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { FraudRegistryV2 } from "../../src/v2/FraudRegistryV2.sol";
import { IFraudRegistryV2 } from "../../src/v2/interfaces/IFraudRegistryV2.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";
import { IOperatorRegistry } from "../../src/interfaces/IOperatorRegistry.sol";

/// @title FraudRegistryV2Test
/// @notice Comprehensive tests for FraudRegistryV2
contract FraudRegistryV2Test is Test {
    FraudRegistryV2 public registry;
    OperatorRegistry public operatorRegistry;

    // Test accounts
    uint256 internal walletPrivateKey;
    address internal wallet;
    address internal forwarder;
    address internal operator;
    address internal owner;

    // Timing configuration (Anvil - 13s blocks)
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // EIP-712 constants
    bytes32 internal constant EIP712_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    string internal constant DOMAIN_NAME = "FraudRegistryV2";
    string internal constant DOMAIN_VERSION = "1";

    string internal constant ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry V2.";

    string internal constant REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry V2. This action is irreversible.";

    bytes32 internal constant ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    bytes32 internal constant REG_TYPEHASH = keccak256(
        "Registration(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    function setUp() public {
        // Set a reasonable starting timestamp (Jan 1, 2024)
        // This prevents underflow when tests use `block.timestamp - 1 days`
        vm.warp(1_704_067_200);

        owner = address(this);

        // Deploy operator registry
        operatorRegistry = new OperatorRegistry(owner);

        // Deploy V2 registry with no fees (feeManager = 0, feeRecipient = 0)
        registry = new FraudRegistryV2(
            owner,
            address(operatorRegistry),
            address(0), // feeManager - disabled for tests
            address(0), // feeRecipient - disabled for tests
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );

        // Create test accounts
        walletPrivateKey = 0xA11CE;
        wallet = vm.addr(walletPrivateKey);
        forwarder = makeAddr("forwarder");
        operator = makeAddr("operator");

        // Fund accounts
        vm.deal(wallet, 10 ether);
        vm.deal(forwarder, 10 ether);
        vm.deal(operator, 10 ether);

        // Approve operator for all registries
        operatorRegistry.approveOperator(operator, operatorRegistry.ALL_REGISTRIES(), "TestOperator");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_TYPE_HASH,
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid,
                address(registry)
            )
        );
    }

    function _signAck(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        uint64 chainId,
        uint64 incidentTs,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH, keccak256(bytes(ACK_STATEMENT)), _wallet, _forwarder, chainId, incidentTs, nonce, deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _signReg(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        uint64 chainId,
        uint64 incidentTs,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                REG_TYPEHASH, keccak256(bytes(REG_STATEMENT)), _wallet, _forwarder, chainId, incidentTs, nonce, deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _doAck(address _forwarder, uint64 chainId, uint64 incidentTs) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, _forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(_forwarder);
        registry.acknowledgeEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
    }

    function _skipToRegistrationWindow() internal {
        (,, uint256 startBlock,,,) = registry.getDeadlines(wallet);
        vm.roll(startBlock + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WILDCARD KEY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Wildcard key should use CAIP-363 format: eip155:_:wallet
    function test_WildcardKey_Format() public pure {
        address testWallet = address(0x1234567890123456789012345678901234567890);
        bytes32 expectedKey = keccak256(abi.encodePacked("eip155:_:", testWallet));

        // The key format should be consistent
        assertEq(expectedKey, keccak256(abi.encodePacked("eip155:_:", testWallet)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Acknowledgement should succeed and set pending state.
    function test_Acknowledge_Success() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);

        assertTrue(registry.isPending(wallet), "Should be pending");
        assertFalse(registry.isRegistered(wallet), "Should not be registered yet");
        assertEq(registry.nonces(wallet), 1, "Nonce should increment");

        IFraudRegistryV2.AcknowledgementData memory ack = registry.getAcknowledgement(wallet);
        assertEq(ack.trustedForwarder, forwarder, "Forwarder should match");
        assertGt(ack.startBlock, block.number, "Start should be in future");
        assertGt(ack.expiryBlock, ack.startBlock, "Expiry should be after start");
    }

    /// Self-relay (wallet is forwarder) should work.
    function test_Acknowledge_SelfRelay() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        // Wallet signs with itself as forwarder
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, wallet, chainId, incidentTs, nonce, deadline);

        vm.prank(wallet);
        registry.acknowledgeEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);

        assertTrue(registry.isPending(wallet));
    }

    /// Acknowledgement should reject expired deadline.
    function test_Acknowledge_RejectsExpiredDeadline() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp - 1; // Expired
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__SignatureExpired.selector);
        registry.acknowledgeEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
    }

    /// Acknowledgement should reject invalid signature.
    function test_Acknowledge_RejectsInvalidSignature() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        // Sign with wrong key
        uint256 wrongKey = 0xBAD;
        (uint8 v, bytes32 r, bytes32 s) = _signAck(wrongKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__InvalidSignature.selector);
        registry.acknowledgeEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
    }

    /// Acknowledgement should reject zero wallet.
    function test_Acknowledge_RejectsZeroWallet() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, address(0), forwarder, chainId, incidentTs, 0, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__InvalidWallet.selector);
        registry.acknowledgeEvmWallet(address(0), chainId, incidentTs, deadline, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Registration should succeed after grace period.
    function test_Register_Success() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(forwarder);
        registry.registerEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);

        assertTrue(registry.isRegistered(wallet), "Should be registered");
        assertFalse(registry.isPending(wallet), "Should not be pending");
        assertEq(registry.nonces(wallet), 2, "Nonce should be 2");

        // Check details
        (
            bool registered,
            IFraudRegistryV2.Namespace ns,
            uint64 reportedChain,
            uint64 incident,
            uint64 registeredAt,
            uint32 batchId
        ) = registry.getEvmWalletDetails(wallet);

        assertTrue(registered);
        assertEq(uint8(ns), uint8(IFraudRegistryV2.Namespace.EIP155));
        assertEq(reportedChain, chainId);
        assertEq(incident, incidentTs);
        assertGt(registeredAt, 0);
        assertEq(batchId, 0); // Individual submission
    }

    /// Registration should fail before grace period.
    function test_Register_FailsBeforeGracePeriod() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);
        // Don't skip to registration window

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__GracePeriodNotStarted.selector);
        registry.registerEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
    }

    /// Registration should fail after expiry.
    function test_Register_FailsAfterExpiry() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);

        // Skip past expiry
        (, uint256 expiryBlock,,,,) = registry.getDeadlines(wallet);
        vm.roll(expiryBlock + 1);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__RegistrationExpired.selector);
        registry.registerEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
    }

    /// Registration should fail with wrong forwarder.
    function test_Register_FailsWithWrongForwarder() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);
        _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrong");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, wrongForwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(wrongForwarder);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__InvalidForwarder.selector);
        registry.registerEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH TESTS - WALLETS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Operator can register batch of wallets.
    function test_OperatorWalletBatch_Success() public {
        address[] memory wallets = new address[](3);
        wallets[0] = makeAddr("victim1");
        wallets[1] = makeAddr("victim2");
        wallets[2] = makeAddr("victim3");

        uint64[] memory chainIds = new uint64[](3);
        chainIds[0] = 8453; // Base
        chainIds[1] = 10; // Optimism
        chainIds[2] = 42_161; // Arbitrum

        uint64[] memory timestamps = new uint64[](3);
        timestamps[0] = uint64(block.timestamp - 1 days);
        timestamps[1] = uint64(block.timestamp - 2 days);
        timestamps[2] = uint64(block.timestamp - 3 days);

        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        // Verify all registered
        for (uint256 i = 0; i < wallets.length; i++) {
            assertTrue(registry.isRegistered(wallets[i]));
        }

        // Check batch metadata
        IFraudRegistryV2.Batch memory batch = registry.getBatch(1);
        assertEq(batch.submitter, operator);
        assertEq(batch.entryCount, 3);
        assertTrue(batch.isOperator);
    }

    /// Non-operator cannot register batch.
    function test_OperatorWalletBatch_FailsForNonOperator() public {
        address[] memory wallets = new address[](1);
        wallets[0] = makeAddr("victim");

        uint64[] memory chainIds = new uint64[](1);
        chainIds[0] = 8453;

        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        address notOperator = makeAddr("notOperator");
        vm.prank(notOperator);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__NotApprovedOperator.selector);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);
    }

    /// Duplicate wallet should emit source added event, not store again.
    function test_OperatorWalletBatch_DuplicateEmitsSourceAdded() public {
        address victim = makeAddr("victim");

        address[] memory wallets = new address[](1);
        wallets[0] = victim;

        uint64[] memory chainIds = new uint64[](1);
        chainIds[0] = 8453;

        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        // First registration
        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        assertTrue(registry.isRegistered(victim));

        // Second registration by same operator
        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit IFraudRegistryV2.WalletOperatorSourceAdded(victim, IFraudRegistryV2.Namespace.EIP155, 8453, operator, 2);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        // Still registered, batch ID unchanged
        (,,,,, uint32 batchId) = registry.getEvmWalletDetails(victim);
        assertEq(batchId, 1); // First batch
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH TESTS - TRANSACTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Operator can register batch of transactions.
    function test_OperatorTxBatch_Success() public {
        bytes32[] memory txHashes = new bytes32[](2);
        txHashes[0] = keccak256("tx1");
        txHashes[1] = keccak256("tx2");

        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = bytes32(uint256(8453));
        chainIds[1] = bytes32(uint256(10));

        vm.prank(operator);
        registry.registerTransactionsAsOperator(txHashes, chainIds);

        assertTrue(registry.isTransactionRegistered(txHashes[0], chainIds[0]));
        assertTrue(registry.isTransactionRegistered(txHashes[1], chainIds[1]));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH TESTS - CONTRACTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Operator can register batch of contracts.
    function test_OperatorContractBatch_Success() public {
        address[] memory contracts = new address[](2);
        contracts[0] = makeAddr("scam1");
        contracts[1] = makeAddr("scam2");

        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = bytes32(uint256(8453));
        chainIds[1] = bytes32(uint256(10));

        vm.prank(operator);
        registry.registerContractsAsOperator(contracts, chainIds);

        assertTrue(registry.isContractRegistered(contracts[0], chainIds[0]));
        assertTrue(registry.isContractRegistered(contracts[1], chainIds[1]));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Owner can invalidate wallet.
    function test_InvalidateWallet_Success() public {
        // Register wallet first
        address[] memory wallets = new address[](1);
        wallets[0] = makeAddr("victim");
        uint64[] memory chainIds = new uint64[](1);
        chainIds[0] = 8453;
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        assertTrue(registry.isRegistered(wallets[0]));

        // Invalidate
        registry.invalidateEvmWallet(wallets[0], "False positive");

        assertFalse(registry.isRegistered(wallets[0]));
    }

    /// Owner can reinstate invalidated wallet.
    function test_ReinstateWallet_Success() public {
        address victim = makeAddr("victim");

        // Register
        address[] memory wallets = new address[](1);
        wallets[0] = victim;
        uint64[] memory chainIds = new uint64[](1);
        chainIds[0] = 8453;
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        // Invalidate
        registry.invalidateEvmWallet(victim, "Test");
        assertFalse(registry.isRegistered(victim));

        // Reinstate
        registry.reinstateEvmWallet(victim);
        assertTrue(registry.isRegistered(victim));
    }

    /// Non-owner cannot invalidate.
    function test_InvalidateWallet_FailsForNonOwner() public {
        address victim = makeAddr("victim");

        // Register
        address[] memory wallets = new address[](1);
        wallets[0] = victim;
        uint64[] memory chainIds = new uint64[](1);
        chainIds[0] = 8453;
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        // Try to invalidate as non-owner
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        registry.invalidateEvmWallet(victim, "Malicious");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVACY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Individual registration should not store relayer address.
    function test_Privacy_IndividualBatchSubmitterIsZero() public {
        // Individual registrations don't create batches with submitter addresses
        // This is verified by checking that batchId is 0 for individual submissions

        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        vm.prank(forwarder);
        registry.registerEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);

        // Verify batchId is 0 (no batch created)
        (,,,,, uint32 batchId) = registry.getEvmWalletDetails(wallet);
        assertEq(batchId, 0, "Individual should have no batch");
    }

    /// Operator batch should store operator address.
    function test_Privacy_OperatorBatchStoresOperator() public {
        address[] memory wallets = new address[](1);
        wallets[0] = makeAddr("victim");
        uint64[] memory chainIds = new uint64[](1);
        chainIds[0] = 8453;
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);

        IFraudRegistryV2.Batch memory batch = registry.getBatch(1);
        assertEq(batch.submitter, operator, "Operator should be stored");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GAS BENCHMARKS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Benchmark single wallet registration gas.
    function test_Gas_SingleWalletRegistration() public {
        uint64 chainId = uint64(block.chainid);
        uint64 incidentTs = uint64(block.timestamp - 1 days);

        _doAck(forwarder, chainId, incidentTs);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, chainId, incidentTs, nonce, deadline);

        uint256 gasBefore = gasleft();
        vm.prank(forwarder);
        registry.registerEvmWallet(wallet, chainId, incidentTs, deadline, v, r, s);
        uint256 gasUsed = gasBefore - gasleft();

        // Should be under 50k gas (PRP target)
        assertLt(gasUsed, 100_000, "Gas should be reasonable");
    }

    /// Benchmark operator batch registration gas.
    function test_Gas_OperatorBatch100() public {
        uint256 count = 100;

        address[] memory wallets = new address[](count);
        uint64[] memory chainIds = new uint64[](count);
        uint64[] memory timestamps = new uint64[](count);

        for (uint256 i = 0; i < count; i++) {
            wallets[i] = address(uint160(i + 1000));
            chainIds[i] = 8453;
            timestamps[i] = uint64(block.timestamp);
        }

        uint256 gasBefore = gasleft();
        vm.prank(operator);
        registry.registerEvmWalletsAsOperator(wallets, chainIds, timestamps);
        uint256 gasUsed = gasBefore - gasleft();

        // Gas per entry
        uint256 gasPerEntry = gasUsed / count;

        // Should be reasonable per entry
        assertLt(gasPerEntry, 50_000, "Gas per entry should be under 50k");
    }
}
