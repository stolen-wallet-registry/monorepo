// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { FraudulentContractRegistry } from "../../src/registries/FraudulentContractRegistry.sol";
import { IFraudulentContractRegistry } from "../../src/interfaces/IFraudulentContractRegistry.sol";
import { OperatorRegistry } from "../../src/OperatorRegistry.sol";
import { RegistryHub } from "../../src/RegistryHub.sol";
import { FeeManager } from "../../src/FeeManager.sol";
import { MerkleRootComputation } from "../../src/libraries/MerkleRootComputation.sol";
import { MerkleTestHelper } from "../helpers/MerkleTestHelper.sol";

/// @notice Full workflow test for FraudulentContractRegistry
contract FraudulentContractWorkflowTest is Test {
    OperatorRegistry operatorRegistry;
    FraudulentContractRegistry contractRegistry;
    RegistryHub registryHub;
    FeeManager feeManager;

    address dao = makeAddr("dao");
    address operator = makeAddr("operator");

    function setUp() public {
        // Deploy full stack
        operatorRegistry = new OperatorRegistry(dao);
        feeManager = new FeeManager(dao, address(0));
        registryHub = new RegistryHub(dao, address(feeManager), address(0));

        contractRegistry =
            new FraudulentContractRegistry(dao, address(operatorRegistry), address(feeManager), address(registryHub));

        // Wire everything
        vm.startPrank(dao);
        registryHub.setOperatorRegistry(address(operatorRegistry));
        registryHub.setFraudulentContractRegistry(address(contractRegistry));
        operatorRegistry.approveOperator(operator, 0x07, "TestOperator");
        vm.stopPrank();

        vm.deal(operator, 100 ether);
    }

    function test_fullWorkflow() public {
        // 1. Operator submits batch
        address[] memory contracts = new address[](2);
        contracts[0] = makeAddr("scam1");
        contracts[1] = makeAddr("scam2");

        bytes32[] memory chainIds = new bytes32[](2);
        chainIds[0] = bytes32(uint256(8453));
        chainIds[1] = bytes32(uint256(8453));

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = contractRegistry.quoteRegistration();

        vm.prank(operator);
        contractRegistry.registerBatch{ value: fee }(merkleRoot, chainIds[0], contracts, chainIds);

        bytes32 batchId = contractRegistry.computeBatchId(merkleRoot, operator, chainIds[0]);

        // 2. Verify batch registered
        assertTrue(contractRegistry.isBatchRegistered(batchId));

        // 3. DAO invalidates one entry
        bytes32 entryHash = contractRegistry.computeEntryHash(contracts[0], chainIds[0]);
        vm.prank(dao);
        contractRegistry.invalidateEntry(entryHash);

        assertTrue(contractRegistry.isEntryInvalidated(entryHash));

        // 4. Batch still valid, but entry is not
        assertTrue(contractRegistry.isBatchRegistered(batchId));

        // 5. DAO reinstates entry
        vm.prank(dao);
        contractRegistry.reinstateEntry(entryHash);

        assertFalse(contractRegistry.isEntryInvalidated(entryHash));

        // 6. DAO invalidates entire batch
        vm.prank(dao);
        contractRegistry.invalidateBatch(batchId);

        assertFalse(contractRegistry.isBatchRegistered(batchId));
    }

    function test_hubWiring() public view {
        // Verify hub knows about the registry
        assertEq(registryHub.fraudulentContractRegistry(), address(contractRegistry));
        assertEq(registryHub.operatorRegistry(), address(operatorRegistry));
    }

    function test_operatorCapabilities() public {
        // Test operator with ALL capabilities (0x07 includes 0x04)
        assertTrue(operatorRegistry.isApprovedFor(operator, 0x04)); // CONTRACT_REGISTRY

        // Test operator with only WALLET capability
        address walletOnlyOperator = makeAddr("walletOnly");
        vm.prank(dao);
        operatorRegistry.approveOperator(walletOnlyOperator, 0x01, "WalletOnly");

        assertFalse(operatorRegistry.isApprovedFor(walletOnlyOperator, 0x04));

        // Test operator with only CONTRACT capability
        address contractOnlyOperator = makeAddr("contractOnly");
        vm.prank(dao);
        operatorRegistry.approveOperator(contractOnlyOperator, 0x04, "ContractOnly");

        assertTrue(operatorRegistry.isApprovedFor(contractOnlyOperator, 0x04));
    }

    function test_feeCollection() public {
        // Check fees flow to hub
        uint256 hubBalanceBefore = address(registryHub).balance;

        address[] memory contracts = new address[](1);
        contracts[0] = makeAddr("scam");

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = bytes32(uint256(8453));

        bytes32 merkleRoot = _computeRoot(contracts, chainIds);
        uint256 fee = contractRegistry.quoteRegistration();

        vm.prank(operator);
        contractRegistry.registerBatch{ value: fee }(merkleRoot, chainIds[0], contracts, chainIds);

        uint256 hubBalanceAfter = address(registryHub).balance;
        assertEq(hubBalanceAfter - hubBalanceBefore, fee);
    }

    function test_multipleOperatorsSubmitting() public {
        // Add second operator
        address operator2 = makeAddr("operator2");
        vm.prank(dao);
        operatorRegistry.approveOperator(operator2, 0x04, "Operator2");
        vm.deal(operator2, 100 ether);

        // Both operators submit different batches
        address[] memory contracts1 = new address[](1);
        contracts1[0] = makeAddr("scam1");

        address[] memory contracts2 = new address[](1);
        contracts2[0] = makeAddr("scam2");

        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = bytes32(uint256(8453));

        bytes32 merkleRoot1 = _computeRoot(contracts1, chainIds);
        bytes32 merkleRoot2 = _computeRoot(contracts2, chainIds);

        uint256 fee = contractRegistry.quoteRegistration();

        vm.prank(operator);
        contractRegistry.registerBatch{ value: fee }(merkleRoot1, chainIds[0], contracts1, chainIds);

        vm.prank(operator2);
        contractRegistry.registerBatch{ value: fee }(merkleRoot2, chainIds[0], contracts2, chainIds);

        // Both batches should be registered with different IDs
        bytes32 batchId1 = contractRegistry.computeBatchId(merkleRoot1, operator, chainIds[0]);
        bytes32 batchId2 = contractRegistry.computeBatchId(merkleRoot2, operator2, chainIds[0]);

        assertTrue(contractRegistry.isBatchRegistered(batchId1));
        assertTrue(contractRegistry.isBatchRegistered(batchId2));
        assertTrue(batchId1 != batchId2);
    }

    /// @notice Compute merkle root and sort arrays in-place for contract submission
    function _computeRoot(address[] memory contracts, bytes32[] memory contractChainIds)
        internal
        pure
        returns (bytes32)
    {
        return MerkleTestHelper.computeAddressRoot(contracts, contractChainIds);
    }
}
