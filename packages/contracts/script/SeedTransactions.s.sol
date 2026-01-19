// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

/// @title SeedTransactions
/// @notice Seeds local Anvil with realistic transaction history for testing
/// @dev Run after deploy:crosschain to populate test accounts with transactions
///
/// Usage:
///   forge script script/SeedTransactions.s.sol --rpc-url localhost --broadcast
///
/// TIP: For faster seeding, run anvil WITHOUT --block-time flag (instant mining)
///      or use: anvil --block-time 1
///
/// The script creates transactions from the first 3 Anvil accounts:
/// - Alice (Account 0): victim wallet with legitimate + fraudulent txs (8+ txs)
/// - Bob (Account 1): some transactions (5+ txs)
/// - Carol (Account 2): some transactions
/// - Mallory (Account 3): attacker receiving "stolen" funds
///
/// Test flow:
/// 1. Connect Alice's wallet to the frontend
/// 2. Navigate to transaction registration
/// 3. See both legitimate (to Bob/Carol) and fraudulent (to Mallory) txs
/// 4. Select the fraudulent ones to Mallory
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

    function run() external {
        console2.log("Seeding transactions for testing...");
        console2.log("TIP: For faster seeding, run anvil without --block-time flag");
        console2.log("");
        console2.log("Accounts:");
        console2.log("  Alice (victim):", ALICE);
        console2.log("  Bob:", BOB);
        console2.log("  Carol:", CAROL);
        console2.log("  Mallory (attacker):", MALLORY);
        console2.log("");

        // All Alice transactions in one broadcast (batched into fewer blocks)
        console2.log("Creating Alice's transactions (10 txs - 5 legit + 5 fraudulent)...");
        vm.startBroadcast(ALICE_KEY);

        // Legitimate transactions (before compromise)
        _sendEther(BOB, 0.5 ether, "Alice -> Bob (payment)");
        _sendEther(CAROL, 0.25 ether, "Alice -> Carol (payment)");
        _sendEther(BOB, 0.1 ether, "Alice -> Bob (tip)");
        _sendEther(DAVE, 0.08 ether, "Alice -> Dave");
        _sendEther(CAROL, 0.15 ether, "Alice -> Carol (refund)");

        // Fraudulent transactions (wallet compromised - drains to Mallory)
        _sendEther(MALLORY, 1.0 ether, "FRAUDULENT: drain 1");
        _sendEther(MALLORY, 0.5 ether, "FRAUDULENT: drain 2");
        _sendEther(MALLORY, 2.3 ether, "FRAUDULENT: drain 3");
        _sendEther(MALLORY, 0.75 ether, "FRAUDULENT: drain 4");
        _sendEther(MALLORY, 1.2 ether, "FRAUDULENT: drain 5");

        vm.stopBroadcast();

        // Bob's transactions in one broadcast
        console2.log("");
        console2.log("Creating Bob's transactions (5 txs)...");
        vm.startBroadcast(BOB_KEY);

        _sendEther(CAROL, 0.1 ether, "Bob -> Carol");
        _sendEther(ALICE, 0.05 ether, "Bob -> Alice");
        _sendEther(DAVE, 0.2 ether, "Bob -> Dave");
        _sendEther(CAROL, 0.08 ether, "Bob -> Carol (2)");
        _sendEther(ALICE, 0.12 ether, "Bob -> Alice (2)");

        vm.stopBroadcast();

        // Carol's transactions in one broadcast
        console2.log("");
        console2.log("Creating Carol's transactions (3 txs)...");
        vm.startBroadcast(CAROL_KEY);

        _sendEther(BOB, 0.15 ether, "Carol -> Bob");
        _sendEther(ALICE, 0.09 ether, "Carol -> Alice");
        _sendEther(DAVE, 0.11 ether, "Carol -> Dave");

        vm.stopBroadcast();

        // Summary
        console2.log("");
        console2.log("========================================");
        console2.log("Seeding complete! (18 transactions total)");
        console2.log("========================================");
        console2.log("");
        console2.log("Transaction counts:");
        console2.log("  Alice: 10 txs (5 legit + 5 fraudulent)");
        console2.log("  Bob: 5 txs");
        console2.log("  Carol: 3 txs");
        console2.log("");
        console2.log("To test transaction registration:");
        console2.log("1. Import Alice (Account 0) into MetaMask");
        console2.log("2. Navigate to /register/transactions");
        console2.log("3. Select the 5 transactions to Mallory (fraudulent)");
        console2.log("4. Complete the two-phase registration flow");
        console2.log("");
        console2.log("Alice's private key:");
        console2.log("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    }

    function _sendEther(address to, uint256 amount, string memory label) internal {
        // Explicit gas limit for simple ETH transfers (21000 is standard for EOA transfers)
        (bool success,) = to.call{ value: amount, gas: 21_000 }("");
        require(success, "Transfer failed");
        console2.log(label);
    }
}
