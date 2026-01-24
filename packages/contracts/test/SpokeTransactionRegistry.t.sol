// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SpokeTransactionRegistry } from "../src/spoke/SpokeTransactionRegistry.sol";
import { ISpokeTransactionRegistry } from "../src/interfaces/ISpokeTransactionRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "./mocks/MockInterchainGasPaymaster.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

contract SpokeTransactionRegistryTest is Test {
    SpokeTransactionRegistry registry;
    HyperlaneAdapter adapter;
    MockMailbox mailbox;
    MockInterchainGasPaymaster gasPaymaster;
    FeeManager feeManager;
    MockAggregator oracle;

    address owner;
    address reporter;
    address forwarder;
    uint256 reporterPk;

    uint32 constant HUB_DOMAIN = 84_532;
    uint32 constant SPOKE_CHAIN_ID = 11_155_420;

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    bytes32 private constant ACK_TYPEHASH = keccak256(
        "TransactionBatchAcknowledgement(string statement,bytes32 merkleRoot,bytes32 reportedChainId,uint32 transactionCount,address forwarder,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant REG_TYPEHASH = keccak256(
        "TransactionBatchRegistration(string statement,bytes32 merkleRoot,bytes32 reportedChainId,address forwarder,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // Statement constants (must match contract)
    string private constant ACK_STATEMENT =
        "This signature acknowledges that the specified transactions are being reported as fraudulent to the Stolen Transaction Registry.";
    string private constant REG_STATEMENT =
        "This signature confirms permanent registration of the specified transactions as fraudulent. This action is irreversible.";

    // Test batch data
    bytes32 merkleRoot = keccak256("merkleRoot");
    bytes32 reportedChainId = keccak256("eip155:1");
    bytes32[] transactionHashes;
    bytes32[] chainIds;

    function setUp() public {
        vm.chainId(SPOKE_CHAIN_ID);

        owner = makeAddr("owner");
        forwarder = makeAddr("forwarder");
        reporterPk = 0xA11CE;
        reporter = vm.addr(reporterPk);
        vm.deal(forwarder, 10 ether);

        // Set up test batch data (5 transactions)
        transactionHashes = new bytes32[](5);
        chainIds = new bytes32[](5);
        for (uint256 i = 0; i < 5; i++) {
            transactionHashes[i] = keccak256(abi.encodePacked("tx", i));
            chainIds[i] = reportedChainId;
        }

        mailbox = new MockMailbox(SPOKE_CHAIN_ID);
        gasPaymaster = new MockInterchainGasPaymaster();

        vm.startPrank(owner);
        adapter = new HyperlaneAdapter(owner, address(mailbox), address(gasPaymaster));
        adapter.setDomainSupport(HUB_DOMAIN, true);
        oracle = new MockAggregator(300_000_000_000);
        feeManager = new FeeManager(owner, address(oracle));
        registry = new SpokeTransactionRegistry(
            owner,
            address(adapter),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );
        vm.stopPrank();
    }

    function _domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPE_HASH, keccak256("StolenTransactionRegistry"), keccak256("4"), block.chainid, verifyingContract
            )
        );
    }

    function _signAck(
        bytes32 _merkleRoot,
        bytes32 _reportedChainId,
        uint32 _transactionCount,
        address forwarderAddr,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        // Statement is hashed per EIP-712 for string types
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH,
                keccak256(bytes(ACK_STATEMENT)),
                _merkleRoot,
                _reportedChainId,
                _transactionCount,
                forwarderAddr,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(registry)), structHash));
        (v, r, s) = vm.sign(reporterPk, digest);
    }

    function _signReg(
        bytes32 _merkleRoot,
        bytes32 _reportedChainId,
        address forwarderAddr,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        // Statement is hashed per EIP-712 for string types
        bytes32 structHash = keccak256(
            abi.encode(
                REG_TYPEHASH,
                keccak256(bytes(REG_STATEMENT)),
                _merkleRoot,
                _reportedChainId,
                forwarderAddr,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(registry)), structHash));
        (v, r, s) = vm.sign(reporterPk, digest);
    }

    function _acknowledge(address forwarderAddr) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(merkleRoot, reportedChainId, uint32(transactionHashes.length), forwarderAddr, nonce, deadline);

        vm.prank(forwarderAddr);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            uint32(transactionHashes.length),
            transactionHashes,
            chainIds,
            reporter,
            deadline,
            v,
            r,
            s
        );
    }

    function _skipToWindow(address reporterAddr) internal {
        (,, uint256 startBlock,,,) = registry.getDeadlines(reporterAddr);
        vm.roll(startBlock + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Constructor should reject a zero owner.
    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new SpokeTransactionRegistry(
            address(0),
            address(adapter),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );
    }

    // Constructor should reject a zero bridge adapter.
    function test_Constructor_RevertsOnZeroBridgeAdapter() public {
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__ZeroAddress.selector);
        new SpokeTransactionRegistry(
            owner,
            address(0),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );
    }

    // Constructor should reject invalid timing parameters.
    function test_Constructor_RevertsOnInvalidTiming() public {
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__InvalidTimingConfig.selector);
        new SpokeTransactionRegistry(
            owner,
            address(adapter),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            0, // Invalid: graceBlocks = 0
            DEADLINE_BLOCKS
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Acknowledgement should reject a zero reporter address.
    function test_Acknowledge_InvalidReporter_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(merkleRoot, reportedChainId, uint32(transactionHashes.length), forwarder, 0, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__InvalidReporter.selector);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            uint32(transactionHashes.length),
            transactionHashes,
            chainIds,
            address(0), // Invalid reporter
            deadline,
            v,
            r,
            s
        );
    }

    // Acknowledgement should reject expired signatures.
    function test_Acknowledge_SignatureExpired_Reverts() public {
        uint256 deadline = block.timestamp - 1; // Expired
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(merkleRoot, reportedChainId, uint32(transactionHashes.length), forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__SignatureExpired.selector);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            uint32(transactionHashes.length),
            transactionHashes,
            chainIds,
            reporter,
            deadline,
            v,
            r,
            s
        );
    }

    // Acknowledgement should reject mismatched array lengths.
    function test_Acknowledge_ArrayLengthMismatch_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(merkleRoot, reportedChainId, uint32(transactionHashes.length), forwarder, nonce, deadline);

        // Create mismatched arrays
        bytes32[] memory mismatchedChainIds = new bytes32[](3); // Different length

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__ArrayLengthMismatch.selector);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            uint32(transactionHashes.length),
            transactionHashes,
            mismatchedChainIds, // Mismatch
            reporter,
            deadline,
            v,
            r,
            s
        );
    }

    // Acknowledgement should reject empty transaction batches.
    function test_Acknowledge_EmptyBatch_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);

        // Empty arrays
        bytes32[] memory emptyHashes = new bytes32[](0);
        bytes32[] memory emptyChainIds = new bytes32[](0);

        // Sign with zero transaction count
        (uint8 v, bytes32 r, bytes32 s) = _signAck(merkleRoot, reportedChainId, 0, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__EmptyBatch.selector);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            0, // Empty batch
            emptyHashes,
            emptyChainIds,
            reporter,
            deadline,
            v,
            r,
            s
        );
    }

    // Acknowledgement should reject invalid signatures.
    function test_Acknowledge_InvalidSigner_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);

        // Sign with wrong key
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH, merkleRoot, reportedChainId, uint32(transactionHashes.length), forwarder, nonce, deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(registry)), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, digest); // Wrong signer

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__InvalidSigner.selector);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            uint32(transactionHashes.length),
            transactionHashes,
            chainIds,
            reporter,
            deadline,
            v,
            r,
            s
        );
    }

    // Successful acknowledgement should emit event and store data.
    function test_Acknowledge_Success() public {
        _acknowledge(forwarder);

        assertTrue(registry.isPending(reporter));
        ISpokeTransactionRegistry.AcknowledgementData memory ack = registry.getAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.pendingMerkleRoot, merkleRoot);
        assertEq(ack.pendingReportedChainId, reportedChainId);
        assertEq(ack.pendingTxCount, uint32(transactionHashes.length));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Registration should fail if hub is not configured.
    function test_Register_HubNotConfigured_Reverts() public {
        SpokeTransactionRegistry noHub = new SpokeTransactionRegistry(
            owner, address(adapter), address(feeManager), HUB_DOMAIN, bytes32(0), GRACE_BLOCKS, DEADLINE_BLOCKS
        );

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = noHub.nonces(reporter);

        // Sign for noHub registry
        bytes32 structHash =
            keccak256(abi.encode(REG_TYPEHASH, merkleRoot, reportedChainId, forwarder, nonce, deadline));
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                keccak256(
                    abi.encode(
                        TYPE_HASH, keccak256("StolenTransactionRegistry"), keccak256("4"), block.chainid, address(noHub)
                    )
                ),
                structHash
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(reporterPk, digest);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__HubNotConfigured.selector);
        noHub.register(merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s);
    }

    // Registration must be submitted by the trusted forwarder.
    function test_Register_InvalidForwarder_Reverts() public {
        _acknowledge(forwarder);
        _skipToWindow(reporter);

        address wrongForwarder = makeAddr("wrongForwarder");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signReg(merkleRoot, reportedChainId, wrongForwarder, nonce, deadline);

        vm.prank(wrongForwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__InvalidForwarder.selector);
        registry.register(merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s);
    }

    // Registration should fail before grace period starts.
    function test_Register_GracePeriodNotStarted_Reverts() public {
        _acknowledge(forwarder);
        // Don't skip to window

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signReg(merkleRoot, reportedChainId, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__GracePeriodNotStarted.selector);
        registry.register(merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s);
    }

    // Registration should fail after expiry.
    function test_Register_RegistrationExpired_Reverts() public {
        _acknowledge(forwarder);

        (, uint256 expiryBlock,,,,) = registry.getDeadlines(reporter);
        vm.roll(expiryBlock + 1);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signReg(merkleRoot, reportedChainId, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__RegistrationExpired.selector);
        registry.register(merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s);
    }

    // Registration should fail with mismatched merkle root.
    function test_Register_MerkleRootMismatch_Reverts() public {
        _acknowledge(forwarder);
        _skipToWindow(reporter);

        bytes32 wrongMerkleRoot = keccak256("wrongRoot");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signReg(wrongMerkleRoot, reportedChainId, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__MerkleRootMismatch.selector);
        registry.register(wrongMerkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s);
    }

    // Registration should require sufficient fee.
    function test_Register_InsufficientFee_Reverts() public {
        _acknowledge(forwarder);
        _skipToWindow(reporter);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(reporter);
        (uint8 v, bytes32 r, bytes32 s) = _signReg(merkleRoot, reportedChainId, forwarder, nonce, deadline);

        uint256 fee = registry.quoteRegistration(uint32(transactionHashes.length));
        assertGt(fee, 0);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__InsufficientFee.selector);
        registry.register{ value: fee - 1 }(
            merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, deadline, v, r, s
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Hub config should reject chainId set with zero inbox.
    function test_SetHubConfig_InvalidCombination_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__InvalidHubConfig.selector);
        registry.setHubConfig(HUB_DOMAIN, bytes32(0));
    }

    // Withdraw should reject a zero recipient.
    function test_WithdrawFees_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(ISpokeTransactionRegistry.SpokeTransactionRegistry__ZeroAddress.selector);
        registry.withdrawFees(address(0), 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE QUOTING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fee breakdown should include both bridge and registration fees.
    function test_QuoteFeeBreakdown_IncludesBothFees() public view {
        ISpokeTransactionRegistry.FeeBreakdown memory breakdown =
            registry.quoteFeeBreakdown(uint32(transactionHashes.length));

        assertGt(breakdown.bridgeFee, 0);
        assertGt(breakdown.registrationFee, 0);
        assertEq(breakdown.total, breakdown.bridgeFee + breakdown.registrationFee);
        assertEq(breakdown.bridgeName, adapter.bridgeName());
    }

    // Fee quotes are consistent regardless of transaction count in mock.
    // In production, larger batches would cost more due to gas costs.
    function test_QuoteFeeBreakdown_ConsistentForDifferentCounts() public view {
        uint256 smallFee = registry.quoteRegistration(5);
        uint256 largeFee = registry.quoteRegistration(50);

        // Both quotes should be valid (non-zero) and at least equal
        // (mock gas paymaster returns fixed fee, so they're equal)
        assertGt(smallFee, 0, "Small fee should be non-zero");
        assertGt(largeFee, 0, "Large fee should be non-zero");
        assertGe(largeFee, smallFee, "Large fee should be >= small fee");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // END-TO-END TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Complete happy-path test: acknowledge → grace period → register → verify cross-chain message
    /// @dev Validates the full two-phase registration flow and state cleanup
    function test_EndToEnd_SuccessfulRegistration() public {
        // Phase 1: Acknowledgement
        uint256 ackDeadline = block.timestamp + 1 hours;
        uint256 ackNonce = registry.nonces(reporter);
        (uint8 v1, bytes32 r1, bytes32 s1) =
            _signAck(merkleRoot, reportedChainId, uint32(transactionHashes.length), forwarder, ackNonce, ackDeadline);

        vm.prank(forwarder);
        registry.acknowledge(
            merkleRoot,
            reportedChainId,
            uint32(transactionHashes.length),
            transactionHashes,
            chainIds,
            reporter,
            ackDeadline,
            v1,
            r1,
            s1
        );

        // Verify acknowledgement state
        assertTrue(registry.isPending(reporter), "Should have pending acknowledgement");
        assertEq(registry.nonces(reporter), ackNonce + 1, "Nonce should increment after ack");

        ISpokeTransactionRegistry.AcknowledgementData memory ack = registry.getAcknowledgement(reporter);
        assertEq(ack.trustedForwarder, forwarder, "Forwarder should match");
        assertEq(ack.pendingMerkleRoot, merkleRoot, "Merkle root should match");
        assertEq(ack.pendingTxCount, uint32(transactionHashes.length), "Tx count should match");

        // Phase 2: Wait for grace period
        _skipToWindow(reporter);

        // Phase 3: Registration
        uint256 regDeadline = block.timestamp + 1 hours;
        uint256 regNonce = registry.nonces(reporter);
        (uint8 v2, bytes32 r2, bytes32 s2) = _signReg(merkleRoot, reportedChainId, forwarder, regNonce, regDeadline);

        uint256 fee = registry.quoteRegistration(uint32(transactionHashes.length));
        assertGt(fee, 0, "Fee should be non-zero");

        // Execute registration
        vm.prank(forwarder);
        registry.register{ value: fee }(
            merkleRoot, reportedChainId, transactionHashes, chainIds, reporter, regDeadline, v2, r2, s2
        );

        // Verify post-registration state
        assertFalse(registry.isPending(reporter), "Should clear pending state after registration");
        assertEq(registry.nonces(reporter), regNonce + 1, "Nonce should increment after registration");

        // Verify acknowledgement data was cleaned up
        ISpokeTransactionRegistry.AcknowledgementData memory clearedAck = registry.getAcknowledgement(reporter);
        assertEq(clearedAck.trustedForwarder, address(0), "Forwarder should be cleared");
        assertEq(clearedAck.pendingMerkleRoot, bytes32(0), "Merkle root should be cleared");

        // Verify cross-chain message was dispatched (check mailbox received message)
        assertGt(mailbox.messageCount(), 0, "Mailbox should have dispatched a message");
    }
}
