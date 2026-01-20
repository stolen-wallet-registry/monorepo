// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

/// @title SeedTransactions
/// @notice Seeds local Anvil chains with transaction history for testing (4 txs per chain)
/// @dev Run after deploy:crosschain to populate test accounts with transactions on BOTH chains
///      Seeds SPOKE chain first since it's more commonly tested for cross-chain flows.
///
/// Usage (seeds BOTH spoke and hub):
///   forge script script/SeedTransactions.s.sol --multi --broadcast
///
/// Or seed individual chains:
///   forge script script/SeedTransactions.s.sol --rpc-url localhost --broadcast      # Hub only
///   forge script script/SeedTransactions.s.sol --rpc-url localhost:8546 --broadcast # Spoke only
///
/// TIP: For faster seeding, run anvil WITHOUT --block-time flag (instant mining)
///
/// The script creates 4 transactions per chain:
/// - Alice (Account 0): 3 txs (1 legit + 2 fraudulent to Mallory)
/// - Bob (Account 1): 1 tx
/// - Mallory (Account 3): attacker receiving "stolen" funds
///
/// Test flow:
/// 1. Connect Alice's wallet (Account 0) to the frontend
/// 2. Navigate to transaction registration
/// 3. See her transactions including 2 fraudulent ones to Mallory
/// 4. Select the 2 fraudulent transactions to Mallory
/// 5. Complete the two-phase registration flow
contract SeedTransactions is Script {
    // Anvil default accounts (from mnemonic: test test test test test test test test test test test junk)
    address constant ALICE = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Account 0 (victim)
    address constant BOB = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Account 1
    address constant CAROL = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // Account 2
    address constant MALLORY = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // Account 3 (attacker)
    address constant DAVE = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65; // Account 4

    // Anvil private keys (derived from test mnemonic)
    uint256 constant ALICE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant BOB_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant CAROL_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    // RPC URLs for multi-chain deployment
    string constant HUB_RPC = "http://localhost:8545";
    string constant SPOKE_RPC = "http://localhost:8546";

    function run() external {
        console2.log("=== SEEDING TRANSACTIONS (Both Chains) ===");
        console2.log("TIP: For faster seeding, run anvil without --block-time flag");
        console2.log("");
        console2.log("Accounts:");
        console2.log("  Alice (victim):", ALICE);
        console2.log("  Bob:", BOB);
        console2.log("  Mallory (attacker):", MALLORY);

        // Seed Spoke chain FIRST (more commonly tested)
        console2.log("");
        console2.log("--- SPOKE CHAIN (31338) ---");
        vm.createSelectFork(SPOKE_RPC);
        _seedAllTransactions("Spoke");

        // Seed Hub chain
        console2.log("");
        console2.log("--- HUB CHAIN (31337) ---");
        vm.createSelectFork(HUB_RPC);
        _seedAllTransactions("Hub");

        // Summary
        console2.log("");
        console2.log("==========================================");
        console2.log("Seeding complete! (4 transactions per chain)");
        console2.log("==========================================");
        console2.log("");
        console2.log("Transaction counts (per chain):");
        console2.log("  Alice: 3 txs (1 legit + 2 fraudulent)");
        console2.log("  Bob: 1 tx");
        console2.log("");
        console2.log("To test transaction registration:");
        console2.log("1. Import Alice (Account 0) into MetaMask");
        console2.log("2. Navigate to /register/transactions");
        console2.log("3. Switch to Spoke (31338) OR Hub (31337) network");
        console2.log("4. Select the 2 transactions to Mallory (fraudulent)");
        console2.log("5. Complete the two-phase registration flow");
        console2.log("");
        console2.log("Alice's private key:");
        console2.log("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    }

    /// @dev Seeds all test transactions on the current chain
    /// @notice Reduced to 4 txs per chain for faster seeding
    function _seedAllTransactions(string memory chainName) internal {
        // Alice transactions (1 legit + 2 fraudulent = 3 txs)
        console2.log("Creating Alice's transactions on", chainName, "(3 txs)...");
        vm.startBroadcast(ALICE_KEY);

        // Legitimate transaction (before compromise)
        _sendEther(BOB, 0.5 ether, "Alice -> Bob (legit payment)");

        // Fraudulent transactions (wallet compromised - drains to Mallory)
        _sendEther(MALLORY, 1.0 ether, "FRAUDULENT: drain 1");
        _sendEther(MALLORY, 2.3 ether, "FRAUDULENT: drain 2");

        vm.stopBroadcast();

        // Bob transaction (1 tx)
        console2.log("Creating Bob's transactions on", chainName, "(1 tx)...");
        vm.startBroadcast(BOB_KEY);

        _sendEther(ALICE, 0.05 ether, "Bob -> Alice");

        vm.stopBroadcast();
    }

    function _sendEther(address to, uint256 amount, string memory label) internal {
        // Explicit gas limit for simple ETH transfers (21000 is standard for EOA transfers)
        (bool success,) = to.call{ value: amount, gas: 21_000 }("");
        require(success, "Transfer failed");
        console2.log("  ", label);
    }
}
