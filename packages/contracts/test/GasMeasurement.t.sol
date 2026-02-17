// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";

/// @title GasMeasurement
/// @notice Measures actual per-entry gas cost for batch registrations.
///         Used to validate calculator assumptions and determine realistic batch size limits.
contract GasMeasurement is Test {
    WalletRegistry public walletRegistry;
    TransactionRegistry public txRegistry;
    ContractRegistry public contractRegistry;

    address public owner;
    address public submitter;

    uint256 constant GRACE_BLOCKS = 10;
    uint256 constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        vm.warp(1_704_067_200);
        owner = address(this);
        submitter = makeAddr("operatorSubmitter");

        walletRegistry = new WalletRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        walletRegistry.setOperatorSubmitter(submitter);

        txRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        txRegistry.setOperatorSubmitter(submitter);

        contractRegistry = new ContractRegistry(owner);
        contractRegistry.setOperatorSubmitter(submitter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET BATCH GAS
    // ═══════════════════════════════════════════════════════════════════════════

    function _buildWalletBatch(uint256 count, uint256 offset)
        internal
        view
        returns (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory timestamps)
    {
        ids = new bytes32[](count);
        chainIds = new bytes32[](count);
        timestamps = new uint64[](count);
        bytes32 chainId = CAIP10Evm.caip2Hash(8453);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = bytes32(uint256(uint160(address(uint160(i + offset + 100)))));
            chainIds[i] = chainId;
            timestamps[i] = uint64(block.timestamp - 1 days);
        }
    }

    function test_walletGas_100() public {
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory ts) = _buildWalletBatch(100, 0);
        bytes32 opId = bytes32(uint256(1));

        uint256 gasBefore = gasleft();
        vm.prank(submitter);
        walletRegistry.registerWalletsFromOperator(opId, ids, chainIds, ts);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("Wallet batch 100 - total gas:", gasUsed);
        console.log("Wallet batch 100 - per entry:", gasUsed / 100);
    }

    function test_walletGas_500() public {
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory ts) = _buildWalletBatch(500, 0);
        bytes32 opId = bytes32(uint256(1));

        uint256 gasBefore = gasleft();
        vm.prank(submitter);
        walletRegistry.registerWalletsFromOperator(opId, ids, chainIds, ts);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("Wallet batch 500 - total gas:", gasUsed);
        console.log("Wallet batch 500 - per entry:", gasUsed / 500);
    }

    function test_walletGas_1000() public {
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory ts) = _buildWalletBatch(1000, 0);
        bytes32 opId = bytes32(uint256(1));

        uint256 gasBefore = gasleft();
        vm.prank(submitter);
        walletRegistry.registerWalletsFromOperator(opId, ids, chainIds, ts);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("Wallet batch 1000 - total gas:", gasUsed);
        console.log("Wallet batch 1000 - per entry:", gasUsed / 1000);
    }

    // Marginal cost: difference between 100 and 10 entries (isolates per-entry from overhead)
    function test_walletGas_marginal() public {
        // Small batch
        (bytes32[] memory ids10, bytes32[] memory c10, uint64[] memory t10) = _buildWalletBatch(10, 0);
        bytes32 opId = bytes32(uint256(1));
        uint256 g1 = gasleft();
        vm.prank(submitter);
        walletRegistry.registerWalletsFromOperator(opId, ids10, c10, t10);
        uint256 gasSmall = g1 - gasleft();

        // Larger batch (different addresses)
        (bytes32[] memory ids100, bytes32[] memory c100, uint64[] memory t100) = _buildWalletBatch(100, 10_000);
        bytes32 opId2 = bytes32(uint256(2));
        uint256 g2 = gasleft();
        vm.prank(submitter);
        walletRegistry.registerWalletsFromOperator(opId2, ids100, c100, t100);
        uint256 gasLarge = g2 - gasleft();

        uint256 marginal = (gasLarge - gasSmall) / 90;
        console.log("Wallet 10 entries - total:", gasSmall);
        console.log("Wallet 100 entries - total:", gasLarge);
        console.log("Wallet marginal gas per entry (90 entry delta):", marginal);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH GAS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_txGas_100() public {
        bytes32[] memory txHashes = new bytes32[](100);
        bytes32[] memory chainIds = new bytes32[](100);
        bytes32 chainId = CAIP10Evm.caip2Hash(8453);
        for (uint256 i = 0; i < 100; i++) {
            txHashes[i] = keccak256(abi.encode("tx", i));
            chainIds[i] = chainId;
        }
        bytes32 opId = bytes32(uint256(1));

        uint256 gasBefore = gasleft();
        vm.prank(submitter);
        txRegistry.registerTransactionsFromOperator(opId, txHashes, chainIds);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("Tx batch 100 - total gas:", gasUsed);
        console.log("Tx batch 100 - per entry:", gasUsed / 100);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTRACT BATCH GAS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_contractGas_100() public {
        bytes32[] memory ids = new bytes32[](100);
        bytes32[] memory chainIds = new bytes32[](100);
        uint8[] memory cats = new uint8[](100);
        bytes32 chainId = CAIP10Evm.caip2Hash(8453);
        for (uint256 i = 0; i < 100; i++) {
            ids[i] = bytes32(uint256(uint160(address(uint160(i + 100)))));
            chainIds[i] = chainId;
            cats[i] = 1; // drainer
        }
        bytes32 opId = bytes32(uint256(1));

        uint256 gasBefore = gasleft();
        vm.prank(submitter);
        contractRegistry.registerContractsFromOperator(opId, ids, chainIds, cats);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("Contract batch 100 - total gas:", gasUsed);
        console.log("Contract batch 100 - per entry:", gasUsed / 100);
    }
}
