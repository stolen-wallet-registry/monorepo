// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { FraudulentContractRegistry } from "../src/registries/FraudulentContractRegistry.sol";
import { IFraudulentContractRegistry } from "../src/interfaces/IFraudulentContractRegistry.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";

contract FraudulentContractRegistryTest is Test {
    FraudulentContractRegistry public registry;
    OperatorRegistry public operatorRegistry;
    FeeManager public feeManager;

    address public dao = makeAddr("dao");
    address public operator = makeAddr("operator");
    address public notOperator = makeAddr("notOperator");
    address public registryHub = makeAddr("registryHub");

    // Test contracts to register
    address public malicious1 = makeAddr("malicious1");
    address public malicious2 = makeAddr("malicious2");
    address public malicious3 = makeAddr("malicious3");

    bytes32 public chainId = bytes32(uint256(8453)); // Base

    function setUp() public {
        // Deploy OperatorRegistry
        operatorRegistry = new OperatorRegistry(dao);

        // Deploy FeeManager (with mock price feed)
        feeManager = new FeeManager(dao, address(0)); // Manual pricing

        // Deploy FraudulentContractRegistry
        registry = new FraudulentContractRegistry(dao, address(operatorRegistry), address(feeManager), registryHub);

        // Approve operator
        vm.prank(dao);
        operatorRegistry.approveOperator(operator, 0x04, "TestOperator"); // CONTRACT_REGISTRY

        // Fund operator
        vm.deal(operator, 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_registerBatch_singleContract() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);

        bytes32 batchId = registry.computeBatchId(merkleRoot, operator, chainId);
        assertTrue(registry.isBatchRegistered(batchId));

        IFraudulentContractRegistry.ContractBatch memory batch = registry.getBatch(batchId);
        assertEq(batch.operator, operator);
        assertEq(batch.contractCount, 1);
        assertFalse(batch.invalidated);
    }

    function test_registerBatch_multipleContracts() public {
        address[] memory contracts = new address[](3);
        contracts[0] = malicious1;
        contracts[1] = malicious2;
        contracts[2] = malicious3;

        bytes32[] memory chainIds = new bytes32[](3);
        chainIds[0] = chainId;
        chainIds[1] = chainId;
        chainIds[2] = bytes32(uint256(1)); // Ethereum mainnet

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);

        bytes32 batchId = registry.computeBatchId(merkleRoot, operator, chainId);
        IFraudulentContractRegistry.ContractBatch memory batch = registry.getBatch(batchId);
        assertEq(batch.contractCount, 3);
    }

    function test_registerBatch_emitsEvent() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        bytes32 batchId = registry.computeBatchId(merkleRoot, operator, chainId);
        uint256 fee = registry.quoteRegistration();

        vm.expectEmit(true, true, true, true);
        emit IFraudulentContractRegistry.ContractBatchRegistered(
            batchId, merkleRoot, operator, chainId, 1, contracts, chainIds
        );

        vm.prank(operator);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_notOperator() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);

        vm.prank(notOperator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__NotApprovedOperator.selector);
        registry.registerBatch(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_wrongCapability() public {
        // Approve operator with WALLET_REGISTRY only
        address walletOperator = makeAddr("walletOperator");
        vm.prank(dao);
        operatorRegistry.approveOperator(walletOperator, 0x01, "WalletOp");

        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);

        vm.prank(walletOperator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__NotApprovedOperator.selector);
        registry.registerBatch(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_insufficientFee() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__InsufficientFee.selector);
        registry.registerBatch{ value: fee - 1 }(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_merkleRootMismatch() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 wrongRoot = bytes32(uint256(12_345));
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__MerkleRootMismatch.selector);
        registry.registerBatch{ value: fee }(wrongRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_alreadyRegistered() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        // First registration
        vm.prank(operator);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);

        // Second registration should fail
        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__AlreadyRegistered.selector);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_emptyContracts() public {
        address[] memory contracts = new address[](0);
        bytes32[] memory chainIds = new bytes32[](0);

        bytes32 merkleRoot = bytes32(uint256(1)); // Arbitrary root
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__InvalidContractCount.selector);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_arrayLengthMismatch() public {
        address[] memory contracts = new address[](2);
        contracts[0] = malicious1;
        contracts[1] = malicious2;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = bytes32(uint256(1));
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__ArrayLengthMismatch.selector);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_invalidMerkleRoot() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 invalidRoot = bytes32(0);
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__InvalidMerkleRoot.selector);
        registry.registerBatch{ value: fee }(invalidRoot, chainId, contracts, chainIds);
    }

    function test_registerBatch_revert_invalidChainId() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__InvalidChainId.selector);
        registry.registerBatch{ value: fee }(merkleRoot, bytes32(0), contracts, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALIDATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_invalidateBatch() public {
        // Register batch first
        (bytes32 batchId,) = _registerTestBatch();

        assertTrue(registry.isBatchRegistered(batchId));

        // Invalidate
        vm.prank(dao);
        registry.invalidateBatch(batchId);

        assertFalse(registry.isBatchRegistered(batchId));

        IFraudulentContractRegistry.ContractBatch memory batch = registry.getBatch(batchId);
        assertTrue(batch.invalidated);
    }

    function test_invalidateBatch_emitsEvent() public {
        (bytes32 batchId,) = _registerTestBatch();

        vm.expectEmit(true, true, false, false);
        emit IFraudulentContractRegistry.BatchInvalidated(batchId, dao);

        vm.prank(dao);
        registry.invalidateBatch(batchId);
    }

    function test_invalidateBatch_revert_notOwner() public {
        (bytes32 batchId,) = _registerTestBatch();

        vm.prank(operator);
        vm.expectRevert();
        registry.invalidateBatch(batchId);
    }

    function test_invalidateBatch_revert_notFound() public {
        bytes32 fakeBatchId = bytes32(uint256(999));

        vm.prank(dao);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__BatchNotFound.selector);
        registry.invalidateBatch(fakeBatchId);
    }

    function test_invalidateBatch_revert_alreadyInvalidated() public {
        (bytes32 batchId,) = _registerTestBatch();

        vm.startPrank(dao);
        registry.invalidateBatch(batchId);

        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__AlreadyInvalidated.selector);
        registry.invalidateBatch(batchId);
        vm.stopPrank();
    }

    function test_invalidateEntry() public {
        (bytes32 batchId,) = _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        // Entry not invalidated yet
        assertFalse(registry.isEntryInvalidated(entryHash));

        // Invalidate entry
        vm.prank(dao);
        registry.invalidateEntry(entryHash);

        assertTrue(registry.isEntryInvalidated(entryHash));

        // Batch still registered, but entry is invalidated
        assertTrue(registry.isBatchRegistered(batchId));
    }

    function test_invalidateEntry_emitsEvent() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        vm.expectEmit(true, true, false, false);
        emit IFraudulentContractRegistry.EntryInvalidated(entryHash, dao);

        vm.prank(dao);
        registry.invalidateEntry(entryHash);
    }

    function test_invalidateEntry_revert_notOwner() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        vm.prank(operator);
        vm.expectRevert();
        registry.invalidateEntry(entryHash);
    }

    function test_invalidateEntry_revert_alreadyInvalidated() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        vm.startPrank(dao);
        registry.invalidateEntry(entryHash);

        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__AlreadyInvalidated.selector);
        registry.invalidateEntry(entryHash);
        vm.stopPrank();
    }

    function test_reinstateEntry() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        // Invalidate then reinstate
        vm.startPrank(dao);
        registry.invalidateEntry(entryHash);
        assertTrue(registry.isEntryInvalidated(entryHash));

        registry.reinstateEntry(entryHash);
        assertFalse(registry.isEntryInvalidated(entryHash));
        vm.stopPrank();
    }

    function test_reinstateEntry_emitsEvent() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        vm.startPrank(dao);
        registry.invalidateEntry(entryHash);

        vm.expectEmit(true, true, false, false);
        emit IFraudulentContractRegistry.EntryReinstated(entryHash, dao);

        registry.reinstateEntry(entryHash);
        vm.stopPrank();
    }

    function test_reinstateEntry_revert_notOwner() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        vm.prank(dao);
        registry.invalidateEntry(entryHash);

        vm.prank(operator);
        vm.expectRevert();
        registry.reinstateEntry(entryHash);
    }

    function test_reinstateEntry_revert_notInvalidated() public {
        _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        vm.prank(dao);
        vm.expectRevert(IFraudulentContractRegistry.FraudulentContractRegistry__NotInvalidated.selector);
        registry.reinstateEntry(entryHash);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_verifyContract_invalidatedBatch() public {
        (bytes32 batchId,) = _registerTestBatch();

        // Generate proof for malicious1 (this is simplified - real test would use proper proof)
        bytes32[] memory proof = new bytes32[](0);

        // Invalidate batch
        vm.prank(dao);
        registry.invalidateBatch(batchId);

        // Verification should fail
        assertFalse(registry.verifyContract(malicious1, chainId, batchId, proof));
    }

    function test_verifyContract_invalidatedEntry() public {
        (bytes32 batchId,) = _registerTestBatch();

        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);
        bytes32[] memory proof = new bytes32[](0);

        // Invalidate specific entry
        vm.prank(dao);
        registry.invalidateEntry(entryHash);

        // Verification should fail for invalidated entry
        assertFalse(registry.verifyContract(malicious1, chainId, batchId, proof));
    }

    function test_verifyContract_nonExistentBatch() public {
        bytes32 fakeBatchId = bytes32(uint256(999));
        bytes32[] memory proof = new bytes32[](0);

        assertFalse(registry.verifyContract(malicious1, chainId, fakeBatchId, proof));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_quoteRegistration() public view {
        uint256 fee = registry.quoteRegistration();
        // FeeManager operatorBatchFeeWei() returns based on $25 at configured ETH price
        assertTrue(fee > 0);
    }

    function test_computeBatchId() public view {
        bytes32 merkleRoot = bytes32(uint256(123));
        bytes32 reportedChainId = bytes32(uint256(8453));

        bytes32 batchId = registry.computeBatchId(merkleRoot, operator, reportedChainId);

        // Should be deterministic
        bytes32 expected = keccak256(abi.encode(merkleRoot, operator, reportedChainId));
        assertEq(batchId, expected);
    }

    function test_computeEntryHash() public view {
        bytes32 entryHash = registry.computeEntryHash(malicious1, chainId);

        bytes32 expected = keccak256(abi.encodePacked(malicious1, chainId));
        assertEq(entryHash, expected);
    }

    function test_immutableGetters() public view {
        assertEq(registry.operatorRegistry(), address(operatorRegistry));
        assertEq(registry.feeManager(), address(feeManager));
        assertEq(registry.registryHub(), registryHub);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_owner() public view {
        assertEq(registry.owner(), dao);
    }

    function test_transferOwnership() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(dao);
        registry.transferOwnership(newOwner);

        // Pending until accepted
        assertEq(registry.owner(), dao);
        assertEq(registry.pendingOwner(), newOwner);

        vm.prank(newOwner);
        registry.acceptOwnership();

        assertEq(registry.owner(), newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE FORWARDING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_registerBatch_forwardsFeeToHub() public {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        uint256 hubBalanceBefore = registryHub.balance;

        vm.prank(operator);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);

        uint256 hubBalanceAfter = registryHub.balance;
        assertEq(hubBalanceAfter - hubBalanceBefore, fee);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _registerTestBatch() internal returns (bytes32 batchId, bytes32 merkleRoot) {
        address[] memory contracts = new address[](1);
        contracts[0] = malicious1;

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = registry.quoteRegistration();

        vm.prank(operator);
        registry.registerBatch{ value: fee }(merkleRoot, chainId, contracts, chainIds);

        batchId = registry.computeBatchId(merkleRoot, operator, chainId);
    }

    /// @notice Compute merkle root matching the contract's implementation
    function _computeRoot(address[] memory contracts, bytes32[] memory chainIds) internal pure returns (bytes32) {
        uint256 length = contracts.length;
        if (length == 0) return bytes32(0);

        // Build leaves
        bytes32[] memory leaves = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            leaves[i] = keccak256(abi.encodePacked(contracts[i], chainIds[i]));
        }

        // Sort leaves (insertion sort)
        for (uint256 i = 1; i < length; i++) {
            bytes32 key = leaves[i];
            uint256 j = i;
            while (j > 0 && leaves[j - 1] > key) {
                leaves[j] = leaves[j - 1];
                j--;
            }
            leaves[j] = key;
        }

        // Build tree bottom-up
        while (length > 1) {
            uint256 newLength = (length + 1) / 2;
            for (uint256 i = 0; i < newLength; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                if (right < length) {
                    if (leaves[left] < leaves[right]) {
                        leaves[i] = keccak256(abi.encodePacked(leaves[left], leaves[right]));
                    } else {
                        leaves[i] = keccak256(abi.encodePacked(leaves[right], leaves[left]));
                    }
                } else {
                    leaves[i] = leaves[left];
                }
            }
            length = newLength;
        }

        return leaves[0];
    }
}
