// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

// Hub contracts
import { RegistryHub } from "../src/RegistryHub.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { CrossChainInbox } from "../src/crosschain/CrossChainInbox.sol";
import { ICrossChainInbox } from "../src/interfaces/ICrossChainInbox.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";

// Spoke contracts
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { ISpokeRegistry } from "../src/interfaces/ISpokeRegistry.sol";

// Libraries
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";

// Mocks
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "./mocks/MockInterchainGasPaymaster.sol";

/// @title CrossChainIntegrationTest
/// @notice Full cross-chain flow tests from spoke registration to hub storage
contract CrossChainIntegrationTest is Test {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;
    // Hub contracts (Base Sepolia)
    RegistryHub hub;
    StolenWalletRegistry hubRegistry;
    CrossChainInbox inbox;
    MockMailbox hubMailbox;

    // Spoke contracts (Optimism Sepolia)
    SpokeRegistry spokeRegistry;
    HyperlaneAdapter spokeAdapter;
    MockMailbox spokeMailbox;
    MockInterchainGasPaymaster spokeGasPaymaster;

    // Actors
    address owner = address(0x1);
    address victim = address(0x2);
    address relayer = address(0x3);
    uint256 victimPk = 0xA11CE;

    // Chain IDs and Hyperlane Domains
    uint32 constant HUB_DOMAIN = 84_532; // Base Sepolia Hyperlane domain
    uint32 constant SPOKE_DOMAIN = 11_155_420; // Optimism Sepolia Hyperlane domain
    uint32 constant HUB_CHAIN_ID = 84_532; // EIP-155 chain ID (same as domain for Base Sepolia)
    uint32 constant SPOKE_CHAIN_ID = 11_155_420; // EIP-155 chain ID

    function setUp() public {
        // Create victim address from private key
        victim = vm.addr(victimPk);

        // ═══════════════════════════════════════════════════════════════════════
        // DEPLOY HUB CONTRACTS (Base Sepolia)
        // ═══════════════════════════════════════════════════════════════════════

        hubMailbox = new MockMailbox(HUB_DOMAIN);

        // Deploy hub first (needed for registry constructor)
        hub = new RegistryHub(owner, address(0), address(0));

        // Deploy hub registry with hub address
        hubRegistry = new StolenWalletRegistry(address(0), address(hub));

        // Set registry in hub
        vm.startPrank(owner);
        hub.setRegistry(hub.STOLEN_WALLET(), address(hubRegistry));

        // Deploy inbox - constructor order: (mailbox, registryHub, owner)
        inbox = new CrossChainInbox(address(hubMailbox), address(hub), owner);

        // Configure hub to use inbox
        hub.setCrossChainInbox(address(inbox));

        vm.stopPrank();

        // ═══════════════════════════════════════════════════════════════════════
        // DEPLOY SPOKE CONTRACTS (Optimism Sepolia)
        // ═══════════════════════════════════════════════════════════════════════

        // Simulate Optimism Sepolia chain ID
        vm.chainId(SPOKE_CHAIN_ID);

        spokeMailbox = new MockMailbox(SPOKE_DOMAIN);
        spokeGasPaymaster = new MockInterchainGasPaymaster();

        vm.startPrank(owner);

        // Deploy spoke adapter
        spokeAdapter = new HyperlaneAdapter(owner, address(spokeMailbox), address(spokeGasPaymaster));
        spokeAdapter.setDomainSupport(HUB_DOMAIN, true);

        // Deploy spoke registry
        bytes32 hubInboxBytes = CrossChainMessage.addressToBytes32(address(inbox));
        spokeRegistry = new SpokeRegistry(owner, address(spokeAdapter), address(0), HUB_DOMAIN, hubInboxBytes);

        vm.stopPrank();

        // ═══════════════════════════════════════════════════════════════════════
        // CONFIGURE TRUST RELATIONSHIPS
        // ═══════════════════════════════════════════════════════════════════════

        // Switch back to hub chain for inbox configuration
        vm.chainId(HUB_CHAIN_ID);

        // Configure inbox to trust spoke registry
        bytes32 spokeRegistryBytes = CrossChainMessage.addressToBytes32(address(spokeRegistry));
        vm.prank(owner);
        inbox.setTrustedSource(SPOKE_DOMAIN, spokeRegistryBytes, true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FULL FLOW TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_FullCrossChainFlow_StandardRegistration() public {
        // Switch to spoke chain
        vm.chainId(SPOKE_CHAIN_ID);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 1: Acknowledgement on spoke
        // ═════════════════════════════════════════════════════════════════════

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spokeRegistry.nonces(victim);

        // Generate signature
        bytes32 ackTypeHash =
            keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(ackTypeHash, victim, victim, nonce, deadline));

        // Get domain separator (EIP-712)
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"),
                SPOKE_CHAIN_ID,
                address(spokeRegistry)
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(victimPk, digest);

        // Submit acknowledgement
        vm.prank(victim);
        spokeRegistry.acknowledgeLocal(deadline, nonce, victim, v, r, s);

        assertTrue(spokeRegistry.isPending(victim), "Should have pending acknowledgement");

        // ═════════════════════════════════════════════════════════════════════
        // STEP 2: Wait for grace period
        // ═════════════════════════════════════════════════════════════════════

        ISpokeRegistry.AcknowledgementData memory ack = spokeRegistry.getAcknowledgement(victim);
        vm.roll(ack.startBlock + 1);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 3: Registration on spoke (triggers cross-chain message)
        // ═════════════════════════════════════════════════════════════════════

        nonce = spokeRegistry.nonces(victim);
        deadline = block.timestamp + 1 hours;

        bytes32 regTypeHash = keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");
        structHash = keccak256(abi.encode(regTypeHash, victim, victim, nonce, deadline));
        digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(victimPk, digest);

        // Get quote for registration
        uint256 fee = spokeRegistry.quoteRegistration(victim);
        vm.deal(victim, fee);

        vm.prank(victim);
        spokeRegistry.registerLocal{ value: fee }(deadline, nonce, victim, v, r, s);

        assertFalse(spokeRegistry.isPending(victim), "Should no longer be pending");

        // ═════════════════════════════════════════════════════════════════════
        // STEP 4: Simulate Hyperlane message delivery to hub
        // ═════════════════════════════════════════════════════════════════════

        // Get the message that was dispatched
        bytes memory messageBody = spokeMailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spokeRegistry));

        // Switch to hub chain
        vm.chainId(HUB_CHAIN_ID);

        // Simulate message receipt (from Hyperlane relayer)
        hubMailbox.simulateReceive(address(inbox), SPOKE_DOMAIN, sender, messageBody);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 5: Verify registration on hub
        // ═════════════════════════════════════════════════════════════════════

        assertTrue(hubRegistry.isRegistered(victim), "Victim should be registered on hub");

        IStolenWalletRegistry.RegistrationData memory data = hubRegistry.getRegistration(victim);
        assertEq(data.sourceChainId, SPOKE_CHAIN_ID, "Source chain should be spoke");
        assertEq(data.bridgeId, uint8(IStolenWalletRegistry.BridgeId.HYPERLANE));
        assertFalse(data.isSponsored, "Should not be sponsored");
        assertTrue(data.crossChainMessageId != bytes32(0), "Should have message ID");
    }

    function test_CrossChainFlow_SponsoredRegistration() public {
        vm.chainId(SPOKE_CHAIN_ID);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 1: Acknowledgement with relayer as forwarder
        // ═════════════════════════════════════════════════════════════════════

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spokeRegistry.nonces(victim);

        bytes32 ackTypeHash =
            keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(ackTypeHash, victim, relayer, nonce, deadline));

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"),
                SPOKE_CHAIN_ID,
                address(spokeRegistry)
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(victimPk, digest);

        // Relayer submits acknowledgement
        vm.prank(relayer);
        spokeRegistry.acknowledgeLocal(deadline, nonce, victim, v, r, s);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 2: Wait for grace period
        // ═════════════════════════════════════════════════════════════════════

        ISpokeRegistry.AcknowledgementData memory ack = spokeRegistry.getAcknowledgement(victim);
        vm.roll(ack.startBlock + 1);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 3: Relayer completes registration
        // ═════════════════════════════════════════════════════════════════════

        nonce = spokeRegistry.nonces(victim);
        deadline = block.timestamp + 1 hours;

        bytes32 regTypeHash = keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");
        structHash = keccak256(abi.encode(regTypeHash, victim, relayer, nonce, deadline));
        digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(victimPk, digest);

        uint256 fee = spokeRegistry.quoteRegistration(victim);
        vm.deal(relayer, fee);

        vm.prank(relayer);
        spokeRegistry.registerLocal{ value: fee }(deadline, nonce, victim, v, r, s);

        // ═════════════════════════════════════════════════════════════════════
        // STEP 4: Deliver to hub and verify
        // ═════════════════════════════════════════════════════════════════════

        bytes memory messageBody = spokeMailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spokeRegistry));

        vm.chainId(HUB_CHAIN_ID);
        hubMailbox.simulateReceive(address(inbox), SPOKE_DOMAIN, sender, messageBody);

        IStolenWalletRegistry.RegistrationData memory data = hubRegistry.getRegistration(victim);
        assertTrue(data.isSponsored, "Should be sponsored");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECURITY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_UntrustedSource_Reverts() public {
        // Create malicious message
        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.RegistrationPayload({
            wallet: victim,
            sourceChainId: 999, // Fake chain
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory messageBody = payload.encodeRegistration();
        bytes32 untrustedSender = bytes32(uint256(1)); // Not trusted

        vm.chainId(HUB_CHAIN_ID);
        vm.expectRevert(ICrossChainInbox.CrossChainInbox__UntrustedSource.selector);
        hubMailbox.simulateReceive(address(inbox), 999, untrustedSender, messageBody);
    }

    function test_OnlyMailboxCanDeliver() public {
        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.RegistrationPayload({
            wallet: victim,
            sourceChainId: SPOKE_CHAIN_ID,
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory messageBody = payload.encodeRegistration();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spokeRegistry));

        vm.chainId(HUB_CHAIN_ID);

        // Try to call handle directly (not from mailbox)
        vm.prank(address(0x999));
        vm.expectRevert(ICrossChainInbox.CrossChainInbox__OnlyBridge.selector);
        inbox.handle(SPOKE_DOMAIN, sender, messageBody);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_HubQueryPassthrough_AfterCrossChain() public {
        // Complete cross-chain registration first
        test_FullCrossChainFlow_StandardRegistration();

        // Query via hub
        assertTrue(hub.isWalletRegistered(victim));
        assertFalse(hub.isWalletPending(victim));
    }
}
