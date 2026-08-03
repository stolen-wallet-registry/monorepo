// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { BatchLimits } from "../src/libraries/BatchLimits.sol";

/// @title GasMeasurement
/// @notice Measures actual per-entry gas cost for batch registrations AND enforces the numbers
///         `BatchLimits` is grounded in.
/// @dev SECURITY-ADJACENT / LOAD-BEARING. `src/libraries/BatchLimits.sol` cites this file by name
///      as the evidence for `MAX_CROSS_CHAIN_BATCH_SIZE = 800` ("measured ~26,200 gas/entry;
///      800 entries ≈ 21M gas, which fits a 25M-gas block"). That claim is not a comment — a spoke
///      accepts and charges for a batch of up to 800 entries, and the hub must then be able to
///      execute it in one transaction on arrival. If per-entry cost regresses (an added storage
///      write, an un-packed struct, an extra SLOAD in the loop), an 800-entry batch stops fitting
///      in a block and every maximum-size cross-chain registration becomes permanently
///      unexecutable, with the user's bridge fee already spent.
///
///      These tests used to be `console.log` only, so that regression could not fail CI. They now
///      assert. The ceilings are deliberately ~15% above measured so an ordinary compiler or
///      EVM-schedule bump does not churn them, while a structural regression (26k → 40k) does fail.
contract GasMeasurement is Test {
    WalletRegistry public walletRegistry;
    TransactionRegistry public txRegistry;
    ContractRegistry public contractRegistry;

    address public owner;
    address public submitter;

    uint256 constant GRACE_BLOCKS = 10;
    uint256 constant DEADLINE_BLOCKS = 50;

    /// @dev ~15% above the highest measured per-entry cost (26,911 for a 100-entry wallet batch,
    ///      where fixed batch overhead is amortised over the fewest entries). Raising this is a
    ///      decision about BatchLimits, not a test fix — see MAX_BATCH_TOTAL_GAS below.
    uint256 constant MAX_PER_ENTRY_GAS = 31_000;

    /// @dev The block gas limit a maximum-size batch must fit inside. Base/Optimism are at 30M+
    ///      today; 25M is the conservative figure BatchLimits' arithmetic is stated against.
    uint256 constant MAX_BATCH_TOTAL_GAS = 25_000_000;

    /// @dev Shared failure message: whatever broke, what broke is the BatchLimits assumption.
    string constant PER_ENTRY_FAILURE = "per-entry gas exceeded the ceiling BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE=800 is derived from"
        " (~26,200 gas/entry). Re-derive the batch limit before raising this.";

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
        assertLt(gasUsed / 100, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
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
        assertLt(gasUsed / 500, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
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
        assertLt(gasUsed / 1000, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
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
        // The marginal figure is the one BatchLimits' linear extrapolation to 800 entries actually
        // relies on — it excludes fixed batch overhead, so it is what scales.
        assertLt(marginal, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
    }

    /// @notice A batch at BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE executes inside a 25M-gas block.
    /// @dev This is the assertion BatchLimits.sol's NatSpec claims exists. A spoke accepts and
    ///      charges for batches up to this size; if the hub cannot execute one in a single
    ///      transaction on arrival, the batch is permanently undeliverable and the bridge fee is
    ///      already spent. Asserting per-entry cost alone would not catch a regression in the
    ///      fixed overhead, and asserting only small batches would not catch superlinear growth.
    function test_MaxCrossChainBatchFitsInABlock() public {
        uint256 count = BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE;
        (bytes32[] memory ids, bytes32[] memory chainIds, uint64[] memory ts) = _buildWalletBatch(count, 50_000);
        bytes32 opId = bytes32(uint256(9));

        uint256 gasBefore = gasleft();
        vm.prank(submitter);
        walletRegistry.registerWalletsFromOperator(opId, ids, chainIds, ts);
        uint256 gasUsed = gasBefore - gasleft();

        console.log("MAX_CROSS_CHAIN_BATCH_SIZE entries - total gas:", gasUsed);
        console.log("MAX_CROSS_CHAIN_BATCH_SIZE entries - per entry:", gasUsed / count);

        assertLt(
            gasUsed,
            MAX_BATCH_TOTAL_GAS,
            "A MAX_CROSS_CHAIN_BATCH_SIZE batch no longer fits in a 25M-gas block. BatchLimits"
            " assumes it does; lower MAX_CROSS_CHAIN_BATCH_SIZE or fix the per-entry regression."
        );
        assertLt(gasUsed / count, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
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
        assertLt(gasUsed / 100, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
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
        assertLt(gasUsed / 100, MAX_PER_ENTRY_GAS, PER_ENTRY_FAILURE);
    }
}
