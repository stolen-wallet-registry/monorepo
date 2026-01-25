// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { BridgeRouter } from "../src/crosschain/BridgeRouter.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "./mocks/MockInterchainGasPaymaster.sol";

contract BridgeRouterTest is Test {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;

    BridgeRouter router;
    HyperlaneAdapter adapter;
    MockMailbox mailbox;
    MockInterchainGasPaymaster gasPaymaster;

    address owner;
    uint32 constant HUB_DOMAIN = 84_532;
    uint32 constant SPOKE_CHAIN_ID = 11_155_420;

    function setUp() public {
        // Set chain ID to match expected source chain for payload validation
        vm.chainId(SPOKE_CHAIN_ID);

        owner = makeAddr("owner");
        mailbox = new MockMailbox(SPOKE_CHAIN_ID);
        gasPaymaster = new MockInterchainGasPaymaster();
        adapter = new HyperlaneAdapter(owner, address(mailbox), address(gasPaymaster));

        vm.startPrank(owner);
        adapter.setDomainSupport(HUB_DOMAIN, true);
        router = new BridgeRouter(owner, HUB_DOMAIN);
        vm.stopPrank();

        // Fund test contract for fee-related tests
        vm.deal(address(this), 10 ether);
    }

    function _payload(address wallet) internal view returns (CrossChainMessage.RegistrationPayload memory) {
        return CrossChainMessage.RegistrationPayload({
            wallet: wallet,
            // Derive from block.chainid to stay in sync with vm.chainId setup
            sourceChainId: uint32(block.chainid),
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: bytes32(0)
        });
    }

    function test_SendToHub_RouteNotConfigured_Reverts() public {
        // Should revert when no hub route is configured.
        vm.expectRevert(BridgeRouter.BridgeRouter__RouteNotConfigured.selector);
        router.sendToHub(_payload(makeAddr("wallet")));
    }

    function test_SetRoute_InvalidConfig_Reverts() public {
        // Prevent enabling a route without adapter or inbox.
        vm.prank(owner);
        vm.expectRevert(BridgeRouter.BridgeRouter__InvalidRouteConfig.selector);
        router.setRoute(HUB_DOMAIN, address(0), bytes32(0), true);
    }

    function test_SendToHub_InsufficientFee_Reverts() public {
        // Should revert when msg.value is below the bridge fee quote.
        vm.prank(owner);
        router.setRoute(HUB_DOMAIN, address(adapter), CrossChainMessage.addressToBytes32(makeAddr("inbox")), true);

        CrossChainMessage.RegistrationPayload memory payload = _payload(makeAddr("wallet"));
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload.encodeRegistration());

        vm.expectRevert(BridgeRouter.BridgeRouter__InsufficientFee.selector);
        router.sendToHub{ value: fee - 1 }(payload);
    }

    function test_SendToHub_RefundFailure_Reverts() public {
        // If refund transfer fails, the router should revert.
        vm.prank(owner);
        router.setRoute(HUB_DOMAIN, address(adapter), CrossChainMessage.addressToBytes32(makeAddr("inbox")), true);

        CrossChainMessage.RegistrationPayload memory payload = _payload(makeAddr("wallet"));
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload.encodeRegistration());
        RefundRejector rejector = new RefundRejector(router);

        vm.expectRevert(BridgeRouter.BridgeRouter__RefundFailed.selector);
        rejector.sendToHub{ value: fee + 1 }(payload);
    }

    function test_SendMessage_AdapterNotConfigured_Reverts() public {
        // Should revert when no adapter is registered for the bridge ID.
        vm.expectRevert(BridgeRouter.BridgeRouter__AdapterNotConfigured.selector);
        router.sendMessage(1, HUB_DOMAIN, bytes32(uint256(1)), "test");
    }

    function test_SendMessage_InsufficientFee_Reverts() public {
        // Should revert when msg.value is below the adapter quote.
        vm.prank(owner);
        router.setAdapter(1, address(adapter));

        vm.expectRevert(BridgeRouter.BridgeRouter__InsufficientFee.selector);
        router.sendMessage{ value: 1 }(1, HUB_DOMAIN, bytes32(uint256(1)), "test");
    }

    function test_SendMessage_RefundFailure_Reverts() public {
        // If refund transfer fails, sendMessage should revert.
        vm.prank(owner);
        router.setAdapter(1, address(adapter));

        bytes memory payload = "test";
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload);
        RefundRejector rejector = new RefundRejector(router);

        vm.expectRevert(BridgeRouter.BridgeRouter__RefundFailed.selector);
        rejector.sendMessage{ value: fee + 1 }(1, HUB_DOMAIN, bytes32(uint256(1)), payload);
    }

    function test_QuoteHubFee_RouteNotConfigured_Reverts() public {
        // Quote should fail if hub route is not configured.
        vm.expectRevert(BridgeRouter.BridgeRouter__RouteNotConfigured.selector);
        router.quoteHubFee(_payload(makeAddr("wallet")));
    }

    function test_IsRouteEnabled_FalseByDefault() public view {
        // Default route state should be disabled.
        assertFalse(router.isRouteEnabled(HUB_DOMAIN));
    }

    function test_IsRouteEnabled_TrueWhenConfigured() public {
        // isRouteEnabled should reflect configured and enabled routes.
        vm.prank(owner);
        router.setRoute(HUB_DOMAIN, address(adapter), CrossChainMessage.addressToBytes32(makeAddr("inbox")), true);
        assertTrue(router.isRouteEnabled(HUB_DOMAIN));
    }
}

contract RefundRejector {
    BridgeRouter public router;

    constructor(BridgeRouter _router) {
        router = _router;
    }

    function sendToHub(CrossChainMessage.RegistrationPayload memory payload) external payable {
        router.sendToHub{ value: msg.value }(payload);
    }

    function sendMessage(uint8 bridgeId, uint32 destinationDomain, bytes32 recipient, bytes calldata payload)
        external
        payable
    {
        router.sendMessage{ value: msg.value }(bridgeId, destinationDomain, recipient, payload);
    }

    receive() external payable {
        revert("refund rejected");
    }
}
