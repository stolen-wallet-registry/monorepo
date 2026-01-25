// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";

// Hub contracts
import { RegistryHub } from "../src/RegistryHub.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { CrossChainInbox } from "../src/crosschain/CrossChainInbox.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";

// Spoke contracts
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { ISpokeRegistry } from "../src/interfaces/ISpokeRegistry.sol";
import { IRegistryHub } from "../src/interfaces/IRegistryHub.sol";
import { ICrossChainInbox } from "../src/interfaces/ICrossChainInbox.sol";

// Libraries
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";

// Mocks
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "./mocks/MockInterchainGasPaymaster.sol";

/// @title CrossChainAdvancedTest
/// @notice Advanced cross-chain tests: multi-spoke, security, edge cases, fuzz
contract CrossChainAdvancedTest is EIP712TestHelper {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;

    // Hub contracts
    RegistryHub hub;
    StolenWalletRegistry hubRegistry;
    CrossChainInbox inbox;
    MockMailbox hubMailbox;

    // Spoke 1 contracts (Optimism)
    SpokeRegistry spoke1Registry;
    HyperlaneAdapter spoke1Adapter;
    MockMailbox spoke1Mailbox;
    MockInterchainGasPaymaster spoke1GasPaymaster;

    // Spoke 2 contracts (Arbitrum)
    SpokeRegistry spoke2Registry;
    HyperlaneAdapter spoke2Adapter;
    MockMailbox spoke2Mailbox;
    MockInterchainGasPaymaster spoke2GasPaymaster;

    // Actors
    address owner = address(0x1);
    address victim1 = address(0x2);
    address victim2 = address(0x3);
    address relayer = address(0x4);
    uint256 victim1Pk = 0xA11CE;
    uint256 victim2Pk = 0xB0B;

    // Chain IDs
    uint32 constant HUB_DOMAIN = 84_532; // Base Sepolia
    uint32 constant SPOKE1_DOMAIN = 11_155_420; // Optimism Sepolia
    uint32 constant SPOKE2_DOMAIN = 421_614; // Arbitrum Sepolia

    // Timing configuration (matching local Anvil - 13s blocks)
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        victim1 = vm.addr(victim1Pk);
        victim2 = vm.addr(victim2Pk);

        // ═══════════════════════════════════════════════════════════════════════
        // DEPLOY HUB CONTRACTS
        // ═══════════════════════════════════════════════════════════════════════

        hubMailbox = new MockMailbox(HUB_DOMAIN);
        hub = new RegistryHub(owner, address(0), address(0));
        hubRegistry = new StolenWalletRegistry(owner, address(0), address(hub), GRACE_BLOCKS, DEADLINE_BLOCKS);

        vm.startPrank(owner);
        hub.setRegistry(hub.STOLEN_WALLET(), address(hubRegistry));
        inbox = new CrossChainInbox(address(hubMailbox), address(hub), owner);
        hub.setCrossChainInbox(address(inbox));
        vm.stopPrank();

        // ═══════════════════════════════════════════════════════════════════════
        // DEPLOY SPOKE 1 (Optimism)
        // ═══════════════════════════════════════════════════════════════════════

        vm.chainId(SPOKE1_DOMAIN);
        spoke1Mailbox = new MockMailbox(SPOKE1_DOMAIN);
        spoke1GasPaymaster = new MockInterchainGasPaymaster();

        vm.startPrank(owner);
        spoke1Adapter = new HyperlaneAdapter(owner, address(spoke1Mailbox), address(spoke1GasPaymaster));
        spoke1Adapter.setDomainSupport(HUB_DOMAIN, true);

        bytes32 hubInboxBytes = CrossChainMessage.addressToBytes32(address(inbox));
        spoke1Registry = new SpokeRegistry(
            owner, address(spoke1Adapter), address(0), HUB_DOMAIN, hubInboxBytes, GRACE_BLOCKS, DEADLINE_BLOCKS
        );
        vm.stopPrank();

        // ═══════════════════════════════════════════════════════════════════════
        // DEPLOY SPOKE 2 (Arbitrum)
        // ═══════════════════════════════════════════════════════════════════════

        vm.chainId(SPOKE2_DOMAIN);
        spoke2Mailbox = new MockMailbox(SPOKE2_DOMAIN);
        spoke2GasPaymaster = new MockInterchainGasPaymaster();

        vm.startPrank(owner);
        spoke2Adapter = new HyperlaneAdapter(owner, address(spoke2Mailbox), address(spoke2GasPaymaster));
        spoke2Adapter.setDomainSupport(HUB_DOMAIN, true);

        spoke2Registry = new SpokeRegistry(
            owner, address(spoke2Adapter), address(0), HUB_DOMAIN, hubInboxBytes, GRACE_BLOCKS, DEADLINE_BLOCKS
        );
        vm.stopPrank();

        // ═══════════════════════════════════════════════════════════════════════
        // CONFIGURE TRUST RELATIONSHIPS
        // ═══════════════════════════════════════════════════════════════════════

        vm.chainId(HUB_DOMAIN);
        vm.startPrank(owner);

        // Trust spoke 1
        bytes32 spoke1RegistryBytes = CrossChainMessage.addressToBytes32(address(spoke1Registry));
        inbox.setTrustedSource(SPOKE1_DOMAIN, spoke1RegistryBytes, true);

        // Trust spoke 2
        bytes32 spoke2RegistryBytes = CrossChainMessage.addressToBytes32(address(spoke2Registry));
        inbox.setTrustedSource(SPOKE2_DOMAIN, spoke2RegistryBytes, true);

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MULTI-SPOKE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Multi-spoke scenario: registrations from different chains should both
    // arrive and persist on the hub with correct sourceChainId metadata.
    function test_MultiSpoke_DifferentWalletsFromDifferentSpokes() public {
        // Register victim1 from spoke1
        _registerFromSpoke(spoke1Registry, spoke1Mailbox, SPOKE1_DOMAIN, victim1, victim1Pk);

        // Register victim2 from spoke2
        _registerFromSpoke(spoke2Registry, spoke2Mailbox, SPOKE2_DOMAIN, victim2, victim2Pk);

        // Verify both registered on hub
        vm.chainId(HUB_DOMAIN);
        assertTrue(hubRegistry.isRegistered(victim1), "Victim1 should be registered");
        assertTrue(hubRegistry.isRegistered(victim2), "Victim2 should be registered");

        // Verify source chains are correct
        IStolenWalletRegistry.RegistrationData memory data1 = hubRegistry.getRegistration(victim1);
        IStolenWalletRegistry.RegistrationData memory data2 = hubRegistry.getRegistration(victim2);

        assertEq(data1.sourceChainId, SPOKE1_DOMAIN, "Victim1 should be from spoke1");
        assertEq(data2.sourceChainId, SPOKE2_DOMAIN, "Victim2 should be from spoke2");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DOUBLE REGISTRATION PREVENTION
    // ═══════════════════════════════════════════════════════════════════════════

    // Double registration defense: the same wallet should not be registrable
    // twice across spokes. The second delivery must revert to preserve
    // immutability and prevent conflicting provenance.
    function test_DoubleRegistration_SameWalletFromTwoSpokes_SecondReverts() public {
        // Register victim1 from spoke1
        _registerFromSpoke(spoke1Registry, spoke1Mailbox, SPOKE1_DOMAIN, victim1, victim1Pk);

        // Verify registered
        vm.chainId(HUB_DOMAIN);
        assertTrue(hubRegistry.isRegistered(victim1));

        // Try to register same wallet from spoke2
        // This should fail when the message is delivered to hub
        vm.chainId(SPOKE2_DOMAIN);

        // Complete the flow on spoke2
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke2Registry.nonces(victim1);
        (uint8 v, bytes32 r, bytes32 s) =
            _signAcknowledgement(spoke2Registry, SPOKE2_DOMAIN, victim1, victim1Pk, nonce, deadline);

        vm.prank(victim1);
        spoke2Registry.acknowledgeLocal(deadline, nonce, victim1, v, r, s);

        ISpokeRegistry.AcknowledgementData memory ack = spoke2Registry.getAcknowledgement(victim1);
        vm.roll(ack.startBlock + 1);

        nonce = spoke2Registry.nonces(victim1);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signRegistration(spoke2Registry, SPOKE2_DOMAIN, victim1, victim1Pk, nonce, deadline);

        uint256 fee = spoke2Registry.quoteRegistration(victim1);
        vm.deal(victim1, fee);

        vm.prank(victim1);
        spoke2Registry.registerLocal{ value: fee }(deadline, nonce, victim1, v, r, s);

        // Get message and try to deliver - should revert
        bytes memory messageBody = spoke2Mailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spoke2Registry));

        vm.chainId(HUB_DOMAIN);
        vm.expectRevert(IStolenWalletRegistry.AlreadyRegistered.selector);
        hubMailbox.simulateReceive(address(inbox), SPOKE2_DOMAIN, sender, messageBody);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MESSAGE REPLAY PREVENTION
    // ═══════════════════════════════════════════════════════════════════════════

    // Replay protection: the same message body should not be processed twice.
    // This ensures idempotence at the hub and prevents duplicate registrations.
    function test_MessageReplay_SameMessageTwice_SecondReverts() public {
        // Complete registration from spoke1
        vm.chainId(SPOKE1_DOMAIN);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke1Registry.nonces(victim1);

        // Acknowledgement
        (uint8 v, bytes32 r, bytes32 s) =
            _signAcknowledgement(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);
        vm.prank(victim1);
        spoke1Registry.acknowledgeLocal(deadline, nonce, victim1, v, r, s);

        ISpokeRegistry.AcknowledgementData memory ack = spoke1Registry.getAcknowledgement(victim1);
        vm.roll(ack.startBlock + 1);

        // Registration
        nonce = spoke1Registry.nonces(victim1);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signRegistration(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);

        uint256 fee = spoke1Registry.quoteRegistration(victim1);
        vm.deal(victim1, fee);

        vm.prank(victim1);
        spoke1Registry.registerLocal{ value: fee }(deadline, nonce, victim1, v, r, s);

        // Save the message
        bytes memory messageBody = spoke1Mailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spoke1Registry));

        // Deliver first time - success
        vm.chainId(HUB_DOMAIN);
        hubMailbox.simulateReceive(address(inbox), SPOKE1_DOMAIN, sender, messageBody);
        assertTrue(hubRegistry.isRegistered(victim1));

        // Try to replay same message - should revert
        vm.expectRevert(IStolenWalletRegistry.AlreadyRegistered.selector);
        hubMailbox.simulateReceive(address(inbox), SPOKE1_DOMAIN, sender, messageBody);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HUB PAUSED DURING DELIVERY
    // ═══════════════════════════════════════════════════════════════════════════

    // Pause handling: when the hub is paused, cross-chain delivery must revert.
    // This preserves emergency stops during incidents.
    function test_HubPaused_CrossChainDeliveryReverts() public {
        // Complete registration on spoke
        vm.chainId(SPOKE1_DOMAIN);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke1Registry.nonces(victim1);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAcknowledgement(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);
        vm.prank(victim1);
        spoke1Registry.acknowledgeLocal(deadline, nonce, victim1, v, r, s);

        ISpokeRegistry.AcknowledgementData memory ack = spoke1Registry.getAcknowledgement(victim1);
        vm.roll(ack.startBlock + 1);

        nonce = spoke1Registry.nonces(victim1);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signRegistration(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);

        uint256 fee = spoke1Registry.quoteRegistration(victim1);
        vm.deal(victim1, fee);

        vm.prank(victim1);
        spoke1Registry.registerLocal{ value: fee }(deadline, nonce, victim1, v, r, s);

        bytes memory messageBody = spoke1Mailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spoke1Registry));

        // Pause hub before delivery
        vm.chainId(HUB_DOMAIN);
        vm.prank(owner);
        hub.setPaused(true);

        // Try to deliver - should revert
        vm.expectRevert(IRegistryHub.Hub__Paused.selector);
        hubMailbox.simulateReceive(address(inbox), SPOKE1_DOMAIN, sender, messageBody);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRUSTED SOURCE REMOVAL
    // ═══════════════════════════════════════════════════════════════════════════

    // Trust revocation: removing a trusted source should immediately block
    // subsequent deliveries from that source.
    function test_TrustedSourceRemoved_DeliveryReverts() public {
        // Complete registration on spoke
        vm.chainId(SPOKE1_DOMAIN);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke1Registry.nonces(victim1);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAcknowledgement(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);
        vm.prank(victim1);
        spoke1Registry.acknowledgeLocal(deadline, nonce, victim1, v, r, s);

        ISpokeRegistry.AcknowledgementData memory ack = spoke1Registry.getAcknowledgement(victim1);
        vm.roll(ack.startBlock + 1);

        nonce = spoke1Registry.nonces(victim1);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signRegistration(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);

        uint256 fee = spoke1Registry.quoteRegistration(victim1);
        vm.deal(victim1, fee);

        vm.prank(victim1);
        spoke1Registry.registerLocal{ value: fee }(deadline, nonce, victim1, v, r, s);

        bytes memory messageBody = spoke1Mailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spoke1Registry));

        // Remove trust before delivery
        vm.chainId(HUB_DOMAIN);
        vm.prank(owner);
        inbox.setTrustedSource(SPOKE1_DOMAIN, sender, false);

        // Try to deliver - should revert
        vm.expectRevert(ICrossChainInbox.CrossChainInbox__UntrustedSource.selector);
        hubMailbox.simulateReceive(address(inbox), SPOKE1_DOMAIN, sender, messageBody);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INVALID MESSAGE FORMAT
    // ═══════════════════════════════════════════════════════════════════════════

    // Message validation: unsupported versions must revert to prevent decoding
    // ambiguity and future format confusion.
    function test_InvalidMessageVersion_Reverts() public {
        // Create message with wrong version
        bytes memory invalidMessage = abi.encode(
            uint8(99), // Wrong version
            CrossChainMessage.MSG_TYPE_REGISTRATION,
            victim1,
            SPOKE1_DOMAIN,
            false,
            uint256(0),
            uint64(block.timestamp),
            bytes32(0)
        );

        bytes32 sender = CrossChainMessage.addressToBytes32(address(spoke1Registry));

        vm.chainId(HUB_DOMAIN);
        vm.expectRevert(CrossChainMessage.CrossChainMessage__UnsupportedVersion.selector);
        hubMailbox.simulateReceive(address(inbox), SPOKE1_DOMAIN, sender, invalidMessage);
    }

    // Message validation: unsupported message types must revert.
    function test_InvalidMessageType_Reverts() public {
        // Create message with wrong type
        bytes memory invalidMessage = abi.encode(
            CrossChainMessage.MESSAGE_VERSION,
            bytes1(0x99), // Wrong type
            victim1,
            SPOKE1_DOMAIN,
            false,
            uint256(0),
            uint64(block.timestamp),
            bytes32(0)
        );

        bytes32 sender = CrossChainMessage.addressToBytes32(address(spoke1Registry));

        vm.chainId(HUB_DOMAIN);
        vm.expectRevert(ICrossChainInbox.CrossChainInbox__UnknownMessageType.selector);
        hubMailbox.simulateReceive(address(inbox), SPOKE1_DOMAIN, sender, invalidMessage);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Fuzz test: encode/decode roundtrip should preserve all payload fields.
    function testFuzz_MessageEncodeDecode_RoundTrip(
        address wallet,
        uint32 sourceChainId,
        bool isSponsored,
        uint256 nonce,
        uint64 timestamp,
        bytes32 registrationHash
    ) public {
        // Fuzz test: encode/decode roundtrip should preserve fields.
        // Skip zero address
        vm.assume(wallet != address(0));

        CrossChainMessage.RegistrationPayload memory original = CrossChainMessage.RegistrationPayload({
            wallet: wallet,
            sourceChainId: sourceChainId,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: timestamp,
            registrationHash: registrationHash
        });

        bytes memory encoded = original.encodeRegistration();

        // Use this contract to decode (calldata conversion)
        CrossChainMessage.RegistrationPayload memory decoded = this.decodeHelper(encoded);

        assertEq(decoded.wallet, original.wallet, "Wallet mismatch");
        assertEq(decoded.sourceChainId, original.sourceChainId, "ChainId mismatch");
        assertEq(decoded.isSponsored, original.isSponsored, "Sponsored mismatch");
        assertEq(decoded.nonce, original.nonce, "Nonce mismatch");
        assertEq(decoded.timestamp, original.timestamp, "Timestamp mismatch");
        assertEq(decoded.registrationHash, original.registrationHash, "Hash mismatch");
    }

    /// @dev Helper to convert memory to calldata for decoding
    function decodeHelper(bytes calldata data) external pure returns (CrossChainMessage.RegistrationPayload memory) {
        // Helper to decode calldata using the library.
        return CrossChainMessage.decodeRegistration(data);
    }

    // Fuzz test: address <-> bytes32 conversion should be lossless.
    function testFuzz_AddressBytes32Conversion_RoundTrip(address addr) public pure {
        bytes32 converted = CrossChainMessage.addressToBytes32(addr);
        address recovered = CrossChainMessage.bytes32ToAddress(converted);
        assertEq(recovered, addr, "Address conversion roundtrip failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════════

    // Fee enforcement: registration must reject payments below the required
    // bridge + protocol fee.
    function test_InsufficientFee_Reverts() public {
        vm.chainId(SPOKE1_DOMAIN);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke1Registry.nonces(victim1);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAcknowledgement(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);
        vm.prank(victim1);
        spoke1Registry.acknowledgeLocal(deadline, nonce, victim1, v, r, s);

        ISpokeRegistry.AcknowledgementData memory ack = spoke1Registry.getAcknowledgement(victim1);
        vm.roll(ack.startBlock + 1);

        nonce = spoke1Registry.nonces(victim1);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signRegistration(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);

        uint256 fee = spoke1Registry.quoteRegistration(victim1);
        vm.deal(victim1, fee - 1); // Not enough

        vm.prank(victim1);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InsufficientFee.selector);
        spoke1Registry.registerLocal{ value: fee - 1 }(deadline, nonce, victim1, v, r, s);
    }

    // Overpayment handling: excess ETH should be refunded to the sender.
    function test_Overpayment_RefundsExcess() public {
        vm.chainId(SPOKE1_DOMAIN);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke1Registry.nonces(victim1);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAcknowledgement(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);
        vm.prank(victim1);
        spoke1Registry.acknowledgeLocal(deadline, nonce, victim1, v, r, s);

        ISpokeRegistry.AcknowledgementData memory ack = spoke1Registry.getAcknowledgement(victim1);
        vm.roll(ack.startBlock + 1);

        nonce = spoke1Registry.nonces(victim1);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signRegistration(spoke1Registry, SPOKE1_DOMAIN, victim1, victim1Pk, nonce, deadline);

        uint256 fee = spoke1Registry.quoteRegistration(victim1);
        uint256 excess = 1 ether;
        vm.deal(victim1, fee + excess);

        uint256 balanceBefore = victim1.balance;

        vm.prank(victim1);
        spoke1Registry.registerLocal{ value: fee + excess }(deadline, nonce, victim1, v, r, s);

        // Victim should have been refunded excess
        // balanceBefore - fee = balanceAfter (excess returned)
        assertEq(victim1.balance, balanceBefore - fee, "Excess should be refunded");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN INBOX DIRECT ACCESS
    // ═══════════════════════════════════════════════════════════════════════════

    // Access control: registerFromSpoke must be callable only by the inbox.
    function test_DirectInboxAccess_NotFromHub_Reverts() public {
        vm.chainId(HUB_DOMAIN);

        // Try to call registerFromSpoke directly (not from inbox)
        vm.prank(address(0x999));
        vm.expectRevert(IRegistryHub.Hub__UnauthorizedInbox.selector);
        hub.registerFromSpoke(victim1, SPOKE1_DOMAIN, false, 1, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _registerFromSpoke(
        SpokeRegistry spokeRegistry,
        MockMailbox spokeMailbox,
        uint32 spokeDomain,
        address victim,
        uint256 victimPk
    ) internal {
        vm.chainId(spokeDomain);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spokeRegistry.nonces(victim);

        // Acknowledgement - use shared helper
        (uint8 v, bytes32 r, bytes32 s) =
            _signWalletAck(victimPk, address(spokeRegistry), victim, victim, nonce, deadline);
        vm.prank(victim);
        spokeRegistry.acknowledgeLocal(deadline, nonce, victim, v, r, s);

        // Wait for grace period
        ISpokeRegistry.AcknowledgementData memory ack = spokeRegistry.getAcknowledgement(victim);
        vm.roll(ack.startBlock + 1);

        // Registration - use shared helper
        nonce = spokeRegistry.nonces(victim);
        deadline = block.timestamp + 1 hours;
        (v, r, s) = _signWalletReg(victimPk, address(spokeRegistry), victim, victim, nonce, deadline);

        uint256 fee = spokeRegistry.quoteRegistration(victim);
        vm.deal(victim, fee);

        vm.prank(victim);
        spokeRegistry.registerLocal{ value: fee }(deadline, nonce, victim, v, r, s);

        // Deliver to hub
        bytes memory messageBody = spokeMailbox.lastMessage();
        bytes32 sender = CrossChainMessage.addressToBytes32(address(spokeRegistry));

        vm.chainId(HUB_DOMAIN);
        hubMailbox.simulateReceive(address(inbox), spokeDomain, sender, messageBody);
    }

    // Note: Statement constants and signing helpers inherited from EIP712TestHelper.
    // Uses WALLET_ACK_STATEMENT, WALLET_REG_STATEMENT, _signWalletAck(), _signWalletReg()

    /// @dev Wrapper for cross-chain tests that need chainId override
    function _signAcknowledgement(
        SpokeRegistry spokeRegistry,
        uint32 chainId,
        address victim,
        uint256 victimPk,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        // Use shared EIP712TestHelper constants
        bytes32 structHash = keccak256(
            abi.encode(WALLET_ACK_TYPEHASH, keccak256(bytes(WALLET_ACK_STATEMENT)), victim, victim, nonce, deadline)
        );

        bytes32 domainSeparator = _walletDomainSeparatorWithChainId(address(spokeRegistry), chainId);

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(victimPk, digest);
    }

    /// @dev Wrapper for cross-chain tests that need chainId override
    function _signRegistration(
        SpokeRegistry spokeRegistry,
        uint32 chainId,
        address victim,
        uint256 victimPk,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        // Use shared EIP712TestHelper constants
        bytes32 structHash = keccak256(
            abi.encode(WALLET_REG_TYPEHASH, keccak256(bytes(WALLET_REG_STATEMENT)), victim, victim, nonce, deadline)
        );

        bytes32 domainSeparator = _walletDomainSeparatorWithChainId(address(spokeRegistry), chainId);

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (v, r, s) = vm.sign(victimPk, digest);
    }
}
