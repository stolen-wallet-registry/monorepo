// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";

/// @title HyperlaneForkedTest
/// @notice Integration test against a real, live Hyperlane Mailbox.
/// @dev Every other Hyperlane test in this suite runs against `test/mocks/MockMailbox.sol`. A mock
///      validates only that our code agrees with our own idea of the interface, which is exactly
///      how the adapter shipped built against the Hyperlane v2 `IMailbox` — non-payable `dispatch`,
///      no `quoteDispatch` — while every live Base/Optimism mailbox is v3. Nothing in the suite
///      could fail, because the mock had the same wrong shape.
///
///      This test dials the real thing. It is skipped unless `OPTIMISM_SEPOLIA_RPC` is set, so it
///      does not make the default suite depend on network access:
///
///          OPTIMISM_SEPOLIA_RPC=https://... forge test --match-contract HyperlaneForked -vv
///
///      Run it before any testnet or mainnet deployment, and after any change to the vendored
///      Hyperlane interfaces (see src/vendor/hyperlane/README.md).
contract HyperlaneForkedTest is Test {
    /// @dev Canonical Hyperlane v3 Mailbox on Optimism Sepolia.
    address constant OP_SEPOLIA_MAILBOX = 0x6966b0E55883d49BFB24539356a2f8A673E02039;

    /// @dev Base Sepolia Hyperlane domain (== chain ID for all EVM chains we support).
    uint32 constant BASE_SEPOLIA_DOMAIN = 84_532;

    HyperlaneAdapter adapter;
    address owner = makeAddr("owner");
    address spoke = makeAddr("spoke");

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("OPTIMISM_SEPOLIA_RPC", string(""));
        if (bytes(rpc).length == 0) return;

        vm.createSelectFork(rpc);
        forked = true;

        adapter = new HyperlaneAdapter(owner, OP_SEPOLIA_MAILBOX);

        vm.startPrank(owner);
        adapter.setDomainSupport(BASE_SEPOLIA_DOMAIN, true);
        adapter.setAuthorizedSender(spoke, true);
        vm.stopPrank();
    }

    modifier onlyForked() {
        if (!forked) {
            console2.log("SKIP: set OPTIMISM_SEPOLIA_RPC to run the forked Hyperlane test");
            return;
        }
        _;
    }

    /// @dev The v2 interface this adapter used to target has no `quoteDispatch` at all, so this
    ///      call would not even find a matching selector on a live mailbox.
    function test_Forked_MailboxSpeaksV3() public onlyForked {
        IMailbox mailbox = IMailbox(OP_SEPOLIA_MAILBOX);

        // v3-only accessors. On a v2 mailbox these selectors do not exist.
        assertTrue(address(mailbox.defaultHook()) != address(0), "no default hook: not a v3 mailbox");
        assertTrue(address(mailbox.requiredHook()) != address(0), "no required hook: not a v3 mailbox");
        assertEq(mailbox.localDomain(), 11_155_420, "unexpected local domain");
    }

    /// @dev A live quote must be non-zero. The old flat `IInterchainGasPaymaster.quoteGasPayment`
    ///      path is gone; if the fee comes back as zero we are talking to something unexpected and
    ///      the subsequent dispatch would revert in the post-dispatch hook.
    function test_Forked_QuoteIsNonZero() public onlyForked {
        uint256 fee = adapter.quoteMessage(BASE_SEPOLIA_DOMAIN, _walletSizedPayload());
        assertGt(fee, 0, "live mailbox quoted a zero fee");
        console2.log("Live single-entry quote (wei):", fee);
    }

    /// @dev The regression that motivated this file: a real dispatch, paid with a real quote,
    ///      against a real mailbox. This is the only test in the suite that would have failed
    ///      while the adapter was built against v2.
    function test_Forked_DispatchSucceeds() public onlyForked {
        bytes memory payload = _walletSizedPayload();
        bytes32 recipient = bytes32(uint256(uint160(makeAddr("hubInbox"))));

        uint256 fee = adapter.quoteMessage(BASE_SEPOLIA_DOMAIN, payload);
        vm.deal(spoke, fee);

        vm.prank(spoke);
        bytes32 messageId = adapter.sendMessage{ value: fee }(BASE_SEPOLIA_DOMAIN, recipient, payload);

        assertTrue(messageId != bytes32(0), "dispatch returned an empty message id");
        assertEq(messageId, IMailbox(OP_SEPOLIA_MAILBOX).latestDispatchedId(), "message id mismatch");
    }

    /// @dev Under-paying a live dispatch must fail on our own check, not deep inside a hook.
    function test_Forked_UnderpaymentReverts() public onlyForked {
        bytes memory payload = _walletSizedPayload();
        bytes32 recipient = bytes32(uint256(uint160(makeAddr("hubInbox"))));

        uint256 fee = adapter.quoteMessage(BASE_SEPOLIA_DOMAIN, payload);
        vm.deal(spoke, fee);

        vm.prank(spoke);
        vm.expectRevert();
        adapter.sendMessage{ value: fee - 1 }(BASE_SEPOLIA_DOMAIN, recipient, payload);
    }

    /// @dev 384 bytes: the exact size of an encoded wallet registration message.
    function _walletSizedPayload() internal pure returns (bytes memory payload) {
        payload = new bytes(384);
        payload[31] = 0x02; // version
        payload[32] = 0x01; // MSG_TYPE_WALLET
    }
}
