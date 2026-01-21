// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { IOperatorRegistry } from "../src/interfaces/IOperatorRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { MerkleRootComputation } from "../src/libraries/MerkleRootComputation.sol";

/// @title StolenWalletRegistryOperatorTest
/// @notice Unit tests for operator batch registration in StolenWalletRegistry
contract StolenWalletRegistryOperatorTest is Test {
    StolenWalletRegistry public registry;
    OperatorRegistry public operatorRegistry;
    FeeManager public feeManager;
    RegistryHub public hub;
    MockAggregator public mockOracle;

    address public dao = makeAddr("dao");
    address public operator = makeAddr("operator");
    address public notOperator = makeAddr("notOperator");

    address public stolen1 = makeAddr("stolen1");
    address public stolen2 = makeAddr("stolen2");
    address public stolen3 = makeAddr("stolen3");
    bytes32 public chainId = bytes32(uint256(8453)); // Base

    // Timing configuration
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        // Deploy OperatorRegistry
        operatorRegistry = new OperatorRegistry(dao);

        // Deploy FeeManager with mock oracle ($3000 ETH)
        mockOracle = new MockAggregator(300_000_000_000);
        feeManager = new FeeManager(dao, address(mockOracle));

        // Deploy RegistryHub
        hub = new RegistryHub(dao, address(feeManager), address(0));

        // Deploy StolenWalletRegistry
        registry = new StolenWalletRegistry(dao, address(feeManager), address(hub), GRACE_BLOCKS, DEADLINE_BLOCKS);

        // Wire up hub and set operator registry
        vm.startPrank(dao);
        hub.setRegistry(hub.STOLEN_WALLET(), address(registry));
        registry.setOperatorRegistry(address(operatorRegistry));
        operatorRegistry.approveOperator(operator, 0x01, "WalletOperator");
        vm.stopPrank();

        vm.deal(operator, 100 ether);
        vm.deal(notOperator, 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER BATCH AS OPERATOR
    // ═══════════════════════════════════════════════════════════════════════════

    function test_registerBatchAsOperator_singleWallet() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);
        assertTrue(registry.isWalletBatchRegistered(batchId));

        IStolenWalletRegistry.WalletBatch memory batch = registry.getWalletBatch(batchId);
        assertEq(batch.operator, operator);
        assertEq(batch.walletCount, 1);
        assertEq(batch.merkleRoot, merkleRoot);
        assertFalse(batch.invalidated);
    }

    function test_registerBatchAsOperator_multipleWallets() public {
        address[] memory wallets = new address[](3);
        wallets[0] = stolen1;
        wallets[1] = stolen2;
        wallets[2] = stolen3;

        bytes32[] memory chainIds = new bytes32[](3);
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);
        assertTrue(registry.isWalletBatchRegistered(batchId));

        IStolenWalletRegistry.WalletBatch memory batch = registry.getWalletBatch(batchId);
        assertEq(batch.walletCount, 3);
    }

    function test_registerBatchAsOperator_emitsEvent() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.expectEmit(true, true, true, true);
        emit IStolenWalletRegistry.WalletBatchRegistered(batchId, merkleRoot, operator, chainId, 1, wallets, chainIds);

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_notOperator() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);

        vm.prank(notOperator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__NotApprovedOperator.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_wrongCapability() public {
        // Approve operator with only TX_REGISTRY capability (0x02)
        address txOnlyOperator = makeAddr("txOnlyOperator");
        vm.prank(dao);
        operatorRegistry.approveOperator(txOnlyOperator, 0x02, "TxOnlyOp");
        vm.deal(txOnlyOperator, 10 ether);

        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);

        vm.prank(txOnlyOperator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__NotApprovedOperator.selector);
        registry.registerBatchAsOperator(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_invalidMerkleRoot() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__InvalidMerkleRoot.selector);
        registry.registerBatchAsOperator{ value: fee }(bytes32(0), chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_invalidChainId() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.InvalidChainId.selector);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, bytes32(0), wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_emptyWallets() public {
        address[] memory wallets = new address[](0);
        bytes32[] memory chainIds = new bytes32[](0);

        bytes32 merkleRoot = bytes32(uint256(1)); // Arbitrary
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__InvalidWalletCount.selector);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_arrayLengthMismatch() public {
        address[] memory wallets = new address[](2);
        wallets[0] = stolen1;
        wallets[1] = stolen2;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = bytes32(uint256(1));
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__ArrayLengthMismatch.selector);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_merkleRootMismatch() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 wrongRoot = bytes32(uint256(12_345));
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__MerkleRootMismatch.selector);
        registry.registerBatchAsOperator{ value: fee }(wrongRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_alreadyRegistered() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        // First registration
        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        // Second registration should fail
        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__BatchAlreadyRegistered.selector);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_insufficientFee() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__InsufficientFee.selector);
        registry.registerBatchAsOperator{ value: fee - 1 }(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_zeroWalletAddress() public {
        address[] memory wallets = new address[](2);
        wallets[0] = stolen1;
        wallets[1] = address(0); // Invalid

        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = chainId;
        chainIds[1] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__InvalidWalletAddress.selector);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);
    }

    function test_registerBatchAsOperator_revert_zeroChainIdEntry() public {
        address[] memory wallets = new address[](2);
        wallets[0] = stolen1;
        wallets[1] = stolen2;

        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = chainId;
        chainIds[1] = bytes32(0); // Invalid

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__InvalidChainIdEntry.selector);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    function test_invalidateWalletBatch() public {
        // Register batch
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);
        assertTrue(registry.isWalletBatchRegistered(batchId));

        // Invalidate
        vm.prank(dao);
        registry.invalidateWalletBatch(batchId);

        assertFalse(registry.isWalletBatchRegistered(batchId));
        assertTrue(registry.getWalletBatch(batchId).invalidated);
    }

    function test_invalidateWalletBatch_emitsEvent() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);

        vm.expectEmit(true, true, false, false);
        emit IStolenWalletRegistry.WalletBatchInvalidated(batchId, dao);

        vm.prank(dao);
        registry.invalidateWalletBatch(batchId);
    }

    function test_invalidateWalletBatch_revert_notOwner() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);

        vm.prank(notOperator);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", notOperator));
        registry.invalidateWalletBatch(batchId);
    }

    function test_invalidateWalletBatch_revert_notFound() public {
        bytes32 fakeBatchId = bytes32(uint256(12_345));

        vm.prank(dao);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__BatchNotFound.selector);
        registry.invalidateWalletBatch(fakeBatchId);
    }

    function test_invalidateWalletBatch_revert_alreadyInvalidated() public {
        address[] memory wallets = new address[](1);
        wallets[0] = stolen1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(wallets, chainIds);
        uint256 fee = registry.quoteOperatorBatchRegistration();

        vm.prank(operator);
        registry.registerBatchAsOperator{ value: fee }(merkleRoot, chainId, wallets, chainIds);

        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);

        vm.startPrank(dao);
        registry.invalidateWalletBatch(batchId);

        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__AlreadyInvalidated.selector);
        registry.invalidateWalletBatch(batchId);
        vm.stopPrank();
    }

    function test_invalidateWalletEntry() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        assertFalse(registry.isWalletEntryInvalidated(entryHash));

        vm.prank(dao);
        registry.invalidateWalletEntry(entryHash);

        assertTrue(registry.isWalletEntryInvalidated(entryHash));
    }

    function test_invalidateWalletEntry_emitsEvent() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.expectEmit(true, true, false, false);
        emit IStolenWalletRegistry.WalletEntryInvalidated(entryHash, dao);

        vm.prank(dao);
        registry.invalidateWalletEntry(entryHash);
    }

    function test_invalidateWalletEntry_revert_notOwner() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.prank(notOperator);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", notOperator));
        registry.invalidateWalletEntry(entryHash);
    }

    function test_invalidateWalletEntry_revert_alreadyInvalidated() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.startPrank(dao);
        registry.invalidateWalletEntry(entryHash);

        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__AlreadyInvalidated.selector);
        registry.invalidateWalletEntry(entryHash);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REINSTATEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    function test_reinstateWalletEntry() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.startPrank(dao);
        registry.invalidateWalletEntry(entryHash);
        assertTrue(registry.isWalletEntryInvalidated(entryHash));

        registry.reinstateWalletEntry(entryHash);
        assertFalse(registry.isWalletEntryInvalidated(entryHash));
        vm.stopPrank();
    }

    function test_reinstateWalletEntry_emitsEvent() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.startPrank(dao);
        registry.invalidateWalletEntry(entryHash);

        vm.expectEmit(true, true, false, false);
        emit IStolenWalletRegistry.WalletEntryReinstated(entryHash, dao);

        registry.reinstateWalletEntry(entryHash);
        vm.stopPrank();
    }

    function test_reinstateWalletEntry_revert_notOwner() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.prank(dao);
        registry.invalidateWalletEntry(entryHash);

        vm.prank(notOperator);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", notOperator));
        registry.reinstateWalletEntry(entryHash);
    }

    function test_reinstateWalletEntry_revert_notInvalidated() public {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);

        vm.prank(dao);
        vm.expectRevert(IStolenWalletRegistry.StolenWalletRegistry__EntryNotInvalidated.selector);
        registry.reinstateWalletEntry(entryHash);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_computeWalletBatchId() public view {
        bytes32 merkleRoot = bytes32(uint256(123));
        bytes32 batchId = registry.computeWalletBatchId(merkleRoot, operator, chainId);
        assertEq(batchId, keccak256(abi.encode(merkleRoot, operator, chainId)));
    }

    function test_computeWalletEntryHash() public view {
        bytes32 entryHash = registry.computeWalletEntryHash(stolen1, chainId);
        assertEq(entryHash, MerkleRootComputation.hashLeaf(stolen1, chainId));
    }

    function test_quoteOperatorBatchRegistration() public view {
        uint256 fee = registry.quoteOperatorBatchRegistration();
        // $25 at $3000 ETH = 0.00833... ETH
        uint256 expectedFee = (uint256(2500) * 1e18) / uint256(300_000);
        assertEq(fee, expectedFee);
    }

    function test_setOperatorRegistry() public {
        address newOpReg = makeAddr("newOpReg");

        vm.expectEmit(true, false, false, false);
        emit IStolenWalletRegistry.OperatorRegistrySet(newOpReg);

        vm.prank(dao);
        registry.setOperatorRegistry(newOpReg);

        assertEq(registry.operatorRegistry(), newOpReg);
    }

    function test_setOperatorRegistry_revert_notOwner() public {
        vm.prank(notOperator);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", notOperator));
        registry.setOperatorRegistry(makeAddr("newOpReg"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Compute merkle root using shared MerkleRootComputation library
    /// @dev Ensures test/prod parity - uses OZ StandardMerkleTree leaf format
    function _computeRoot(address[] memory wallets, bytes32[] memory walletChainIds) internal pure returns (bytes32) {
        uint256 length = wallets.length;
        if (length == 0) return bytes32(0);

        // Build leaves in OZ StandardMerkleTree format
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = MerkleRootComputation.hashLeaf(wallets[i], walletChainIds[i]);
        }

        return MerkleRootComputation.computeRoot(leaves);
    }
}
