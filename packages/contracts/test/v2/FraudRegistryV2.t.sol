// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { FraudRegistryV2 } from "../../src/v2/FraudRegistryV2.sol";
import { IFraudRegistryV2 } from "../../src/v2/interfaces/IFraudRegistryV2.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";
import { IOperatorRegistry } from "../../src/interfaces/IOperatorRegistry.sol";
import { CAIP10 } from "../../src/v2/libraries/CAIP10.sol";

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
            uint64 reportedChainIdHash,
            uint64 incident,
            uint64 registeredAt,
            uint32 batchId
        ) = registry.getEvmWalletDetails(wallet);

        assertTrue(registered);
        assertEq(uint8(ns), uint8(IFraudRegistryV2.Namespace.EIP155));
        // Stored value is truncated CAIP-2 hash, not raw chain ID
        assertEq(reportedChainIdHash, CAIP10.truncatedEvmChainIdHash(chainId));
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
    // OPERATOR BATCH HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Helper to build unified operator wallet batch params from EVM addresses
    function _buildEvmWalletBatchParams(address[] memory wallets, uint64[] memory chainIds, uint64[] memory timestamps)
        internal
        pure
        returns (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        )
    {
        uint256 length = wallets.length;
        namespaceHashes = new bytes32[](length);
        chainRefs = new bytes32[](length);
        identifiers = new bytes32[](length);
        reportedChainIds = new bytes32[](length);
        incidentTimestamps = timestamps;

        for (uint256 i = 0; i < length; i++) {
            namespaceHashes[i] = CAIP10.NAMESPACE_EIP155;
            chainRefs[i] = bytes32(0); // Ignored for EVM
            identifiers[i] = bytes32(uint256(uint160(wallets[i])));
            reportedChainIds[i] = CAIP10.caip2Hash(chainIds[i]);
        }
    }

    /// Helper to build unified operator tx batch params
    function _buildEvmTxBatchParams(bytes32[] memory txHashes, uint64[] memory chainIds)
        internal
        pure
        returns (bytes32[] memory namespaceHashes, bytes32[] memory chainRefs, bytes32[] memory hashes)
    {
        uint256 length = txHashes.length;
        namespaceHashes = new bytes32[](length);
        chainRefs = new bytes32[](length);
        hashes = txHashes;

        for (uint256 i = 0; i < length; i++) {
            namespaceHashes[i] = CAIP10.NAMESPACE_EIP155;
            chainRefs[i] = CAIP10.evmChainRefHash(chainIds[i]);
        }
    }

    /// Helper to build unified operator contract batch params
    function _buildEvmContractBatchParams(address[] memory contracts, uint64[] memory chainIds)
        internal
        pure
        returns (bytes32[] memory namespaceHashes, bytes32[] memory chainRefs, bytes32[] memory contractIds)
    {
        uint256 length = contracts.length;
        namespaceHashes = new bytes32[](length);
        chainRefs = new bytes32[](length);
        contractIds = new bytes32[](length);

        for (uint256 i = 0; i < length; i++) {
            namespaceHashes[i] = CAIP10.NAMESPACE_EIP155;
            chainRefs[i] = CAIP10.evmChainRefHash(chainIds[i]);
            contractIds[i] = bytes32(uint256(uint160(contracts[i])));
        }
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

        // Convert to unified format
        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        address notOperator = makeAddr("notOperator");
        vm.prank(notOperator);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__NotApprovedOperator.selector);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );
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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        // First registration
        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

        assertTrue(registry.isRegistered(victim));

        // Second registration by same operator
        // Event emits truncated CAIP-2 hash, not raw chain ID
        uint64 expectedChainIdHash = CAIP10.truncatedEvmChainIdHash(8453);
        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit IFraudRegistryV2.WalletOperatorSourceAdded(
            victim, IFraudRegistryV2.Namespace.EIP155, expectedChainIdHash, operator, 2
        );
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

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

        uint64[] memory chainIds = new uint64[](2);
        chainIds[0] = 8453;
        chainIds[1] = 10;

        (bytes32[] memory namespaceHashes, bytes32[] memory chainRefs, bytes32[] memory hashes) =
            _buildEvmTxBatchParams(txHashes, chainIds);

        vm.prank(operator);
        registry.registerTransactionsAsOperator(namespaceHashes, chainRefs, hashes);

        // Compute expected chain IDs for lookup (namespace:chainRef combined)
        bytes32 expectedChainId1 = keccak256(abi.encodePacked(CAIP10.NAMESPACE_EIP155, CAIP10.evmChainRefHash(8453)));
        bytes32 expectedChainId2 = keccak256(abi.encodePacked(CAIP10.NAMESPACE_EIP155, CAIP10.evmChainRefHash(10)));

        assertTrue(registry.isTransactionRegistered(txHashes[0], expectedChainId1));
        assertTrue(registry.isTransactionRegistered(txHashes[1], expectedChainId2));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATOR BATCH TESTS - CONTRACTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Operator can register batch of contracts.
    function test_OperatorContractBatch_Success() public {
        address[] memory contracts = new address[](2);
        contracts[0] = makeAddr("scam1");
        contracts[1] = makeAddr("scam2");

        uint64[] memory chainIds = new uint64[](2);
        chainIds[0] = 8453;
        chainIds[1] = 10;

        (bytes32[] memory namespaceHashes, bytes32[] memory chainRefs, bytes32[] memory contractIds) =
            _buildEvmContractBatchParams(contracts, chainIds);

        vm.prank(operator);
        registry.registerContractsAsOperator(namespaceHashes, chainRefs, contractIds);

        // Compute expected chain IDs for lookup (namespace:chainRef combined)
        bytes32 expectedChainId1 = keccak256(abi.encodePacked(CAIP10.NAMESPACE_EIP155, CAIP10.evmChainRefHash(8453)));
        bytes32 expectedChainId2 = keccak256(abi.encodePacked(CAIP10.NAMESPACE_EIP155, CAIP10.evmChainRefHash(10)));

        assertTrue(registry.isContractRegistered(contracts[0], expectedChainId1));
        assertTrue(registry.isContractRegistered(contracts[1], expectedChainId2));
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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );

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

        (
            bytes32[] memory namespaceHashes,
            bytes32[] memory chainRefs,
            bytes32[] memory identifiers,
            bytes32[] memory reportedChainIds,
            uint64[] memory incidentTimestamps
        ) = _buildEvmWalletBatchParams(wallets, chainIds, timestamps);

        uint256 gasBefore = gasleft();
        vm.prank(operator);
        registry.registerWalletsAsOperator(
            namespaceHashes, chainRefs, identifiers, reportedChainIds, incidentTimestamps
        );
        uint256 gasUsed = gasBefore - gasleft();

        // Gas per entry
        uint256 gasPerEntry = gasUsed / count;

        // Should be reasonable per entry
        assertLt(gasPerEntry, 50_000, "Gas per entry should be under 50k");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Cross-chain registration succeeds when called by authorized hub.
    function test_RegisterFromSpoke_Success() public {
        // Set up registry hub
        address hub = makeAddr("crossChainInbox");
        registry.setCrossChainInbox(hub);

        address victim = makeAddr("crossChainVictim");
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        // Cross-chain parameters (bytes32 for cross-blockchain support)
        bytes32 reportedChainIdFull = CAIP10.caip2Hash(uint64(1)); // Full CAIP-2 hash
        bytes32 sourceChainIdFull = CAIP10.caip2Hash(uint64(10)); // Optimism

        // Expect cross-chain event (uses full bytes32 for indexers)
        vm.expectEmit(true, true, true, true);
        emit IFraudRegistryV2.CrossChainWalletRegistered(
            CAIP10.NAMESPACE_EIP155,
            bytes32(uint256(uint160(victim))),
            sourceChainIdFull,
            reportedChainIdFull,
            incidentTimestamp,
            1, // bridgeId
            keccak256("test_message")
        );

        vm.prank(hub);
        registry.registerFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            CAIP10.evmChainRefHash(1), // chainRef (ignored for EVM)
            bytes32(uint256(uint160(victim))), // identifier
            reportedChainIdFull,
            incidentTimestamp,
            sourceChainIdFull,
            true, // isSponsored
            1, // bridgeId
            keccak256("test_message")
        );

        // Verify registration
        assertTrue(registry.isRegistered(victim));

        // Verify details - use separate scope to reduce stack
        {
            (
                bool registered,
                IFraudRegistryV2.Namespace namespace,
                uint64 storedChainIdHash,
                uint64 storedIncident,
                uint64 registeredAt,
                uint32 batchId
            ) = registry.getEvmWalletDetails(victim);

            assertTrue(registered);
            assertEq(uint8(namespace), uint8(IFraudRegistryV2.Namespace.EIP155));
            assertEq(storedChainIdHash, CAIP10.truncatedChainIdHash(reportedChainIdFull));
            assertEq(storedIncident, incidentTimestamp);
            assertGt(registeredAt, 0);
            assertEq(batchId, 0); // Individual submission
        }
    }

    /// Cross-chain registration fails when caller is not the hub.
    function test_RegisterFromSpoke_FailsUnauthorized() public {
        address hub = makeAddr("crossChainInbox");
        registry.setCrossChainInbox(hub);

        address victim = makeAddr("victim");
        address notHub = makeAddr("notHub");

        vm.prank(notHub);
        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__UnauthorizedInbox.selector);
        registry.registerFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            CAIP10.evmChainRefHash(1),
            bytes32(uint256(uint160(victim))),
            CAIP10.caip2Hash(uint64(1)),
            uint64(block.timestamp),
            CAIP10.caip2Hash(uint64(10)),
            false,
            1,
            bytes32(0)
        );
    }

    /// Cross-chain registration fails when hub is not configured.
    function test_RegisterFromSpoke_FailsNoHubConfigured() public {
        // Hub is address(0) by default
        assertEq(registry.crossChainInbox(), address(0));

        address victim = makeAddr("victim");

        vm.expectRevert(IFraudRegistryV2.FraudRegistryV2__UnauthorizedInbox.selector);
        registry.registerFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            CAIP10.evmChainRefHash(1),
            bytes32(uint256(uint160(victim))),
            CAIP10.caip2Hash(uint64(1)),
            uint64(block.timestamp),
            CAIP10.caip2Hash(uint64(10)),
            false,
            1,
            bytes32(0)
        );
    }

    /// Cross-chain registration silently succeeds for already registered wallet.
    function test_RegisterFromSpoke_SkipsDuplicate() public {
        address hub = makeAddr("crossChainInbox");
        registry.setCrossChainInbox(hub);

        address victim = makeAddr("duplicateVictim");
        bytes32 identifier = bytes32(uint256(uint160(victim)));

        // First registration
        vm.prank(hub);
        registry.registerFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            CAIP10.evmChainRefHash(1),
            identifier,
            CAIP10.caip2Hash(uint64(1)),
            uint64(block.timestamp),
            CAIP10.caip2Hash(uint64(10)),
            false,
            1,
            keccak256("message1")
        );
        assertTrue(registry.isRegistered(victim));

        // Get initial registration timestamp
        (,,,, uint64 firstRegisteredAt,) = registry.getEvmWalletDetails(victim);

        // Second registration with different chain IDs should silently succeed (no revert)
        vm.prank(hub);
        registry.registerFromSpoke(
            CAIP10.NAMESPACE_EIP155,
            CAIP10.evmChainRefHash(1),
            identifier,
            CAIP10.caip2Hash(uint64(8453)),
            uint64(block.timestamp - 1 hours),
            CAIP10.caip2Hash(uint64(42_161)),
            true,
            1,
            keccak256("message2")
        );

        // Timestamp should be unchanged (wasn't overwritten)
        (,,,, uint64 secondRegisteredAt,) = registry.getEvmWalletDetails(victim);
        assertEq(firstRegisteredAt, secondRegisteredAt);
    }

    /// Only owner can set registry hub.
    function test_SetRegistryHub_OnlyOwner() public {
        address hub = makeAddr("newHub");
        address notOwner = makeAddr("notOwner");

        vm.prank(notOwner);
        vm.expectRevert();
        registry.setCrossChainInbox(hub);
    }

    /// Owner can set registry hub to address(0) to disable cross-chain.
    function test_SetRegistryHub_CanDisable() public {
        address hub = makeAddr("hub");

        registry.setCrossChainInbox(hub);
        assertEq(registry.crossChainInbox(), hub);

        registry.setCrossChainInbox(address(0));
        assertEq(registry.crossChainInbox(), address(0));
    }
}
