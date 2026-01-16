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
/// The script creates transactions from the first 3 Anvil accounts:
/// - Alice (Account 0): victim wallet with legitimate + fraudulent txs
/// - Bob (Account 1): receives some legitimate payments
/// - Carol (Account 2): also receives legitimate payments
/// - Mallory (Account 3): attacker receiving "stolen" funds
///
/// Test flow:
/// 1. Connect Alice's wallet to the frontend
/// 2. Navigate to transaction registration
/// 3. See both legitimate (to Bob/Carol) and fraudulent (to Mallory) txs
/// 4. Select the fraudulent ones to Mallory
/// 5. Complete the two-phase registration
contract SeedTransactions is Script {
    // Anvil default accounts (from mnemonic: test test test test test test test test test test test junk)
    address constant ALICE = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Account 0 (victim)
    address constant BOB = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // Account 1
    address constant CAROL = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; // Account 2
    address constant MALLORY = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // Account 3 (attacker)

    // Anvil private keys (derived from test mnemonic)
    uint256 constant ALICE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant BOB_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant CAROL_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    function run() external {
        console2.log("Seeding transactions for testing...");
        console2.log("");
        console2.log("Accounts:");
        console2.log("  Alice (victim):", ALICE);
        console2.log("  Bob:", BOB);
        console2.log("  Carol:", CAROL);
        console2.log("  Mallory (attacker):", MALLORY);
        console2.log("");

        // Phase 1: Legitimate transactions from Alice (before compromise)
        console2.log("Phase 1: Creating legitimate transactions...");
        vm.startBroadcast(ALICE_KEY);

        _sendEther(BOB, 0.5 ether, "Legitimate: Alice -> Bob");
        _sendEther(CAROL, 0.25 ether, "Legitimate: Alice -> Carol");
        _sendEther(BOB, 0.1 ether, "Legitimate: Alice -> Bob (2)");

        vm.stopBroadcast();

        // Phase 2: Fraudulent transactions from Alice (wallet compromised)
        console2.log("");
        console2.log("Phase 2: Creating fraudulent transactions (attacker draining funds)...");
        vm.startBroadcast(ALICE_KEY);

        _sendEther(MALLORY, 1.0 ether, "FRAUDULENT: Alice -> Mallory (drain 1)");
        _sendEther(MALLORY, 0.5 ether, "FRAUDULENT: Alice -> Mallory (drain 2)");
        _sendEther(MALLORY, 2.3 ether, "FRAUDULENT: Alice -> Mallory (drain 3)");

        vm.stopBroadcast();

        // Phase 3: Some transactions from Bob (for variety)
        console2.log("");
        console2.log("Phase 3: Creating transactions from Bob...");
        vm.startBroadcast(BOB_KEY);

        _sendEther(CAROL, 0.1 ether, "Bob -> Carol");
        _sendEther(ALICE, 0.05 ether, "Bob -> Alice");

        vm.stopBroadcast();

        // Phase 4: Some transactions from Carol (for variety)
        console2.log("");
        console2.log("Phase 4: Creating transactions from Carol...");
        vm.startBroadcast(CAROL_KEY);

        _sendEther(BOB, 0.15 ether, "Carol -> Bob");

        vm.stopBroadcast();

        // Summary
        console2.log("");
        console2.log("========================================");
        console2.log("Seeding complete!");
        console2.log("========================================");
        console2.log("");
        console2.log("To test transaction registration:");
        console2.log("1. Import Alice (Account 0) into MetaMask using Anvil private key");
        console2.log("2. Connect to frontend, navigate to /registration/transactions");
        console2.log("3. You should see transactions to Bob, Carol, AND Mallory");
        console2.log("4. Select the 3 transactions to Mallory (fraudulent)");
        console2.log("5. Complete the two-phase registration flow");
        console2.log("");
        console2.log("Alice's private key (for MetaMask):");
        console2.log("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    }

    function _sendEther(address to, uint256 amount, string memory label) internal {
        (bool success,) = to.call{ value: amount }("");
        require(success, "Transfer failed");
        console2.log(label);
    }
}
