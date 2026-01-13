// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CrossChainInbox } from "../src/crosschain/CrossChainInbox.sol";
import { ICrossChainInbox } from "../src/interfaces/ICrossChainInbox.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

contract CrossChainInboxTest is Test {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;

    MockMailbox mailbox;
    CrossChainInbox inbox;

    address owner;
    address registryHub;

    uint32 constant HUB_DOMAIN = 84_532;
    uint32 constant SPOKE_DOMAIN = 11_155_420;
    uint256 constant BRIDGE_ID_HYPERLANE = 1;

    function setUp() public {
        owner = makeAddr("owner");
        registryHub = makeAddr("registryHub");
        mailbox = new MockMailbox(HUB_DOMAIN);
        inbox = new CrossChainInbox(address(mailbox), registryHub, owner);

        // Label addresses for clearer trace output
        vm.label(owner, "owner");
        vm.label(registryHub, "registryHub");
        vm.label(address(mailbox), "mailbox");
        vm.label(address(inbox), "inbox");
    }

    function test_Constructor_ZeroMailbox_Reverts() public {
        // Ensure constructor rejects a zero mailbox address.
        vm.expectRevert(ICrossChainInbox.CrossChainInbox__ZeroAddress.selector);
        new CrossChainInbox(address(0), registryHub, owner);
    }

    function test_Constructor_ZeroRegistryHub_Reverts() public {
        // Ensure constructor rejects a zero registry hub address.
        vm.expectRevert(ICrossChainInbox.CrossChainInbox__ZeroAddress.selector);
        new CrossChainInbox(address(mailbox), address(0), owner);
    }

    function test_Constructor_ZeroOwner_Reverts() public {
        // Ownable should reject a zero owner before contract-level checks.
        // Use encodeWithSelector to compute selector at runtime (avoids import dependency).
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("OwnableInvalidOwner(address)")), address(0)));
        new CrossChainInbox(address(mailbox), registryHub, address(0));
    }

    function test_SetTrustedSource_OnlyOwner() public {
        // Only the owner should be able to update trusted sources.
        address user = makeAddr("user");
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        inbox.setTrustedSource(SPOKE_DOMAIN, bytes32(uint256(1)), true);
        vm.stopPrank();
    }

    function test_SetTrustedSource_Success() public {
        // Owner should be able to set trusted sources and state should update.
        bytes32 sender = bytes32(uint256(1));

        vm.prank(owner);
        inbox.setTrustedSource(SPOKE_DOMAIN, sender, true);

        assertTrue(inbox.isTrustedSource(SPOKE_DOMAIN, sender));

        // Verify we can also remove trusted sources
        vm.prank(owner);
        inbox.setTrustedSource(SPOKE_DOMAIN, sender, false);

        assertFalse(inbox.isTrustedSource(SPOKE_DOMAIN, sender));
    }

    function test_Handle_SourceChainMismatch_Reverts() public {
        // Defensive check: payload source chain must match the Hyperlane origin.
        bytes32 sender = CrossChainMessage.addressToBytes32(makeAddr("spokeRegistry"));

        vm.prank(owner);
        inbox.setTrustedSource(SPOKE_DOMAIN, sender, true);

        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.RegistrationPayload({
            wallet: makeAddr("victim"),
            sourceChainId: SPOKE_DOMAIN + 1,
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });

        bytes memory messageBody = payload.encodeRegistration();

        vm.expectRevert(ICrossChainInbox.CrossChainInbox__SourceChainMismatch.selector);
        mailbox.simulateReceive(address(inbox), SPOKE_DOMAIN, sender, messageBody);
    }

    function test_BridgeId_ReturnsHyperlane() public view {
        // Ensure the inbox advertises the expected bridge ID constant.
        assertEq(inbox.bridgeId(), BRIDGE_ID_HYPERLANE);
    }
}
