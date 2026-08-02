// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { IBridgeAdapter } from "../src/interfaces/IBridgeAdapter.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { BatchLimits } from "../src/libraries/BatchLimits.sol";

contract HyperlaneAdapterTest is Test {
    HyperlaneAdapter adapter;
    MockMailbox mailbox;

    address owner = address(0x1);
    address user = address(0x2);

    uint32 constant LOCAL_DOMAIN = 11_155_420; // Optimism Sepolia
    uint32 constant HUB_DOMAIN = 84_532; // Base Sepolia

    function setUp() public {
        mailbox = new MockMailbox(LOCAL_DOMAIN);

        vm.prank(owner);
        adapter = new HyperlaneAdapter(owner, address(mailbox));

        // Configure supported domain
        vm.prank(owner);
        adapter.setDomainSupport(HUB_DOMAIN, true);

        // The test contract and `user` stand in for the spoke contracts that dispatch through the adapter
        vm.startPrank(owner);
        adapter.setAuthorizedSender(address(this), true);
        adapter.setAuthorizedSender(user, true);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsImmutables() public view {
        // Constructor should store mailbox and owner. There is no gas paymaster argument:
        // from Hyperlane v3 the interchain gas payment is collected by the mailbox's own
        // default post-dispatch hook during dispatch().
        assertEq(address(adapter.mailbox()), address(mailbox));
        assertEq(adapter.owner(), owner);
    }

    function test_BridgeName() public view {
        // Adapter should return its bridge name.
        assertEq(adapter.bridgeName(), "Hyperlane");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DOMAIN SUPPORT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SupportsChain_Enabled() public view {
        // supportsChain should return true for enabled domains.
        assertTrue(adapter.supportsChain(HUB_DOMAIN));
    }

    function test_SupportsChain_Disabled() public view {
        // supportsChain should return false for disabled domains.
        assertFalse(adapter.supportsChain(999));
    }

    function test_SetDomainSupport_OnlyOwner() public {
        // Only owner should be able to update domain support.
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        adapter.setDomainSupport(999, true);
    }

    function test_SetDomainSupport_Success() public {
        // setDomainSupport should update state and emit event.
        uint32 newDomain = 42_161; // Arbitrum One

        vm.expectEmit(true, false, false, true);
        emit HyperlaneAdapter.DomainSupportUpdated(newDomain, true);

        vm.prank(owner);
        adapter.setDomainSupport(newDomain, true);

        assertTrue(adapter.supportsChain(newDomain));
    }

    function test_AddDomains_Batch() public {
        // addDomains should enable all provided domains.
        uint32[] memory domains = new uint32[](3);
        domains[0] = 1;
        domains[1] = 10;
        domains[2] = 137;

        vm.prank(owner);
        adapter.addDomains(domains);

        assertTrue(adapter.supportsChain(1));
        assertTrue(adapter.supportsChain(10));
        assertTrue(adapter.supportsChain(137));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUOTE MESSAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_QuoteMessage_UnsupportedChain_Reverts() public {
        // quoteMessage should revert for unsupported chains.
        vm.expectRevert(IBridgeAdapter.BridgeAdapter__UnsupportedChain.selector);
        adapter.quoteMessage(999, "test");
    }

    function test_QuoteMessage_Success() public view {
        // A non-batch payload is one entry: base 200,000 + 1 x 35,000 per-entry, at 1 gwei.
        uint256 quote = adapter.quoteMessage(HUB_DOMAIN, "test");

        uint256 expected = (200_000 + 35_000) * 1 gwei;
        assertEq(quote, expected);
    }

    function test_QuoteMessage_CustomGasAmounts() public {
        // Per-domain overrides should replace both halves of the gas model.
        vm.prank(owner);
        adapter.setGasAmounts(HUB_DOMAIN, 500_000, 10_000);

        uint256 quote = adapter.quoteMessage(HUB_DOMAIN, "test");
        assertEq(quote, (500_000 + 10_000) * 1 gwei);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEND MESSAGE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SendMessage_UnsupportedChain_Reverts() public {
        // sendMessage should revert for unsupported chains.
        vm.expectRevert(IBridgeAdapter.BridgeAdapter__UnsupportedChain.selector);
        adapter.sendMessage(999, bytes32(uint256(1)), "test");
    }

    /// @dev The adapter is the address the destination CrossChainInbox and SoulboundReceiver trust
    ///      as the origin sender, because Hyperlane records the dispatcher rather than its caller.
    ///      An unauthorized caller therefore must not be able to dispatch anything at all — otherwise
    ///      any EOA could forge a payload the hub accepts as a legitimate spoke message and register
    ///      an arbitrary wallet as stolen with no EIP-712 signature, grace period, or fee.
    function test_SendMessage_UnauthorizedSender_Reverts() public {
        address attacker = makeAddr("attacker");
        vm.deal(attacker, 1 ether);
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));

        vm.prank(attacker);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__UnauthorizedSender.selector);
        adapter.sendMessage{ value: 1 ether }(HUB_DOMAIN, recipient, "forged payload");
    }

    /// @dev Authorization must be revocable, so a compromised spoke contract can be cut off.
    function test_SendMessage_RevokedSender_Reverts() public {
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));

        vm.prank(owner);
        adapter.setAuthorizedSender(address(this), false);

        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__UnauthorizedSender.selector);
        adapter.sendMessage{ value: 1 ether }(HUB_DOMAIN, recipient, "test");
    }

    function test_SetAuthorizedSender_OnlyOwner() public {
        address attacker = makeAddr("attacker");

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        adapter.setAuthorizedSender(attacker, true);
    }

    function test_SetAuthorizedSender_RejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__ZeroAddress.selector);
        adapter.setAuthorizedSender(address(0), true);
    }

    function test_SetAuthorizedSender_EmitsEvent() public {
        address spoke = makeAddr("spoke");

        vm.expectEmit(true, false, false, true);
        emit HyperlaneAdapter.AuthorizedSenderUpdated(spoke, true);

        vm.prank(owner);
        adapter.setAuthorizedSender(spoke, true);
        assertTrue(adapter.authorizedSenders(spoke));
    }

    function test_SendMessage_InsufficientFee_Reverts() public {
        // sendMessage should revert if msg.value is below quote.
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));

        vm.expectRevert(IBridgeAdapter.BridgeAdapter__InsufficientFee.selector);
        adapter.sendMessage{ value: 1 }(HUB_DOMAIN, recipient, "test");
    }

    function test_SendMessage_Success() public {
        // sendMessage should dispatch via mailbox and emit event.
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));
        bytes memory payload = "registration_data";
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload);

        vm.deal(user, fee);
        vm.prank(user);

        // Don't check messageId - it's dynamic
        vm.expectEmit(false, true, false, true);
        emit IBridgeAdapter.MessageSent(bytes32(0), HUB_DOMAIN, recipient, payload);

        bytes32 messageId = adapter.sendMessage{ value: fee }(HUB_DOMAIN, recipient, payload);

        // Verify message was dispatched
        assertEq(mailbox.lastDestination(), HUB_DOMAIN);
        assertEq(mailbox.lastRecipient(), recipient);
        assertEq(mailbox.lastMessage(), payload);
        assertEq(messageId, mailbox.lastMessageId());
    }

    function test_SendMessage_RefundsExcess() public {
        // sendMessage should refund any excess payment.
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));
        bytes memory payload = "test";
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload);
        uint256 excess = 0.1 ether;

        vm.deal(user, fee + excess);
        uint256 balanceBefore = user.balance;

        vm.prank(user);
        adapter.sendMessage{ value: fee + excess }(HUB_DOMAIN, recipient, payload);

        // User should have received refund of excess
        assertEq(user.balance, balanceBefore - fee);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GAS AMOUNT CONFIGURATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetGasAmounts_OnlyOwner() public {
        // setGasAmounts should be owner-only.
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user));
        adapter.setGasAmounts(HUB_DOMAIN, 300_000, 20_000);
    }

    function test_SetGasAmounts_Success() public {
        // setGasAmounts should update state and emit event.
        vm.expectEmit(true, false, false, true);
        emit HyperlaneAdapter.GasAmountUpdated(HUB_DOMAIN, 300_000, 20_000);

        vm.prank(owner);
        adapter.setGasAmounts(HUB_DOMAIN, 300_000, 20_000);

        assertEq(adapter.baseGasAmounts(HUB_DOMAIN), 300_000);
        assertEq(adapter.perEntryGasAmounts(HUB_DOMAIN), 20_000);
    }

    function test_DefaultGasAmounts() public view {
        assertEq(adapter.DEFAULT_BASE_GAS(), 200_000);
        assertEq(adapter.DEFAULT_PER_ENTRY_GAS(), 35_000);
    }

    /// @notice A gas model that would make a maximum-size batch exceed MAX_GAS_LIMIT is rejected.
    /// @dev Without this bound, a plausible perEntryGas bump (e.g. 40k after a destination
    ///      gas-schedule change) would make every large batch revert on quoteMessage —
    ///      including already-acknowledged batches whose reporters burned a nonce and cannot
    ///      re-acknowledge until expiry. 40_000 × 800 + 200_000 = 32.2M > 30M.
    ///
    ///      The batch size is read from BatchLimits, the same constant _validateGasModel uses,
    ///      rather than hardcoded: with a literal 800 here, raising the shared limit would make
    ///      this test assert against a batch size the contract no longer enforces.
    function test_SetGasAmounts_RejectsConfigThatBreaksMaxBatch() public {
        uint256 maxBatch = BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE;
        // Any per-entry value that overflows the ceiling alongside the default base.
        uint256 tooMuch = ((adapter.MAX_GAS_LIMIT() - adapter.DEFAULT_BASE_GAS()) / maxBatch) + 1;

        vm.prank(owner);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__GasConfigExceedsLimit.selector);
        adapter.setGasAmounts(HUB_DOMAIN, 0, tooMuch);
    }

    /// @notice baseGas carries its own ceiling, independent of the combined check.
    /// @dev The combined bound alone does NOT catch a huge base paired with a small per-entry cost:
    ///      `setGasAmounts(d, 29_000_000, 1_000)` computes 29M + 1_000 × 800 = 29.8M, which is
    ///      under MAX_GAS_LIMIT and used to validate cleanly. Every single-entry cross-chain
    ///      registration would then buy ~29M of destination gas through the IGP — a fee-inflation
    ///      lever on an owner-only setter with no timelock in front of it.
    ///
    ///      This asserts the ORIGINAL exploit config is now rejected. It is discriminating by
    ///      construction: the combined check passes these numbers, so only MAX_BASE_GAS can be
    ///      what rejects them.
    function test_SetGasAmounts_RejectsInflatedBaseGasThatCombinedCheckMisses() public {
        // Precondition: prove the combined check really would have let this through.
        assertLe(
            uint256(29_000_000) + 1000 * BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE,
            adapter.MAX_GAS_LIMIT(),
            "precondition: the combined bound does not reject this config"
        );

        vm.prank(owner);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__GasConfigExceedsLimit.selector);
        adapter.setGasAmounts(HUB_DOMAIN, 29_000_000, 1000);

        assertEq(adapter.baseGasAmounts(HUB_DOMAIN), 0, "rejected config must not be written");
    }

    /// @notice One wei of gas over MAX_BASE_GAS is rejected.
    /// @dev Paired with the exact-value success below. perEntryGas is 0 here, so the effective
    ///      per-entry falls back to DEFAULT_PER_ENTRY_GAS and the combined total is ~28.8M —
    ///      comfortably under MAX_GAS_LIMIT. The combined check therefore cannot fire, which makes
    ///      MAX_BASE_GAS provably the only bound under test.
    function test_SetGasAmounts_RejectsBaseGasAboveMaxBaseGas() public {
        uint256 overLimit = adapter.MAX_BASE_GAS() + 1;

        // Precondition: the combined bound is not what rejects this.
        assertLe(
            overLimit + adapter.DEFAULT_PER_ENTRY_GAS() * BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE,
            adapter.MAX_GAS_LIMIT(),
            "precondition: the combined bound does not reject this config"
        );

        vm.prank(owner);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__GasConfigExceedsLimit.selector);
        adapter.setGasAmounts(HUB_DOMAIN, overLimit, 0);
    }

    /// @notice Exactly MAX_BASE_GAS is accepted — the bound is `>`, not `>=`.
    /// @dev The load-bearing half of the pair. Without it, a bound mistakenly written as `>=`
    ///      (rejecting the documented maximum) would go unnoticed, and so would a check that
    ///      rejected every non-zero baseGas outright. Adjacent to the rejection above, so an
    ///      off-by-one in either direction breaks exactly one of the two.
    function test_SetGasAmounts_AcceptsBaseGasAtExactlyMaxBaseGas() public {
        uint256 atLimit = adapter.MAX_BASE_GAS();

        vm.prank(owner);
        adapter.setGasAmounts(HUB_DOMAIN, atLimit, 0);

        assertEq(adapter.baseGasAmounts(HUB_DOMAIN), atLimit, "the documented maximum must be usable");
    }

    /// @notice The bound validates the effective values: 0 means "use default", not "no gas".
    /// @dev baseGas = 0 falls back to DEFAULT_BASE_GAS, so a perEntryGas at exactly the ceiling
    ///      for a ZERO base must still be rejected once the default base is added back. A bound
    ///      that validated the raw arguments instead of the effective ones would accept it.
    function test_SetGasAmounts_ValidatesEffectiveDefaults() public {
        uint256 maxBatch = BatchLimits.MAX_CROSS_CHAIN_BATCH_SIZE;

        // Exactly fills MAX_GAS_LIMIT with a zero base — and therefore overflows it once the
        // default base is applied.
        uint256 fitsOnlyWithoutBase = adapter.MAX_GAS_LIMIT() / maxBatch;
        vm.prank(owner);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__GasConfigExceedsLimit.selector);
        adapter.setGasAmounts(HUB_DOMAIN, 0, fitsOnlyWithoutBase);

        // The largest per-entry value that fits alongside the default base is accepted.
        uint256 maxPerEntry = (adapter.MAX_GAS_LIMIT() - adapter.DEFAULT_BASE_GAS()) / maxBatch;
        vm.prank(owner);
        adapter.setGasAmounts(HUB_DOMAIN, 0, maxPerEntry);
        assertEq(adapter.perEntryGasAmounts(HUB_DOMAIN), maxPerEntry);
    }

    // \u2550\u2550\u2550 PAYLOAD-AWARE GAS QUOTING \u2550\u2550\u2550

    /// @dev Builds a transaction-batch payload with `count` entries, matching the encoding
    ///      SpokeRegistry produces via CrossChainMessage.encodeTransactionBatch.
    function _batchPayload(uint32 count) internal pure returns (bytes memory) {
        bytes32[] memory hashes = new bytes32[](count);
        bytes32[] memory chainIds = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            hashes[i] = bytes32(uint256(i + 1));
            chainIds[i] = keccak256("eip155:8453");
        }
        return CrossChainMessage.encodeTransactionBatch(
            CrossChainMessage.TransactionBatchPayload({
                dataHash: keccak256("data"),
                reporter: address(0xBEEF),
                reportedChainId: keccak256("eip155:8453"),
                sourceChainId: keccak256("eip155:10"),
                transactionCount: count,
                isSponsored: false,
                nonce: 1,
                timestamp: 1_700_000_000,
                transactionHashes: hashes,
                chainIds: chainIds
            })
        );
    }

    /// @dev The core of the under-funding bug: destination execution cost scales linearly with
    ///      entry count, so a quote that ignores the payload strands every large batch on the
    ///      spoke with the fee already spent. entryCount must read the real batch size.
    function test_EntryCount_ReadsTransactionBatchSize() public view {
        assertEq(adapter.entryCount(_batchPayload(1)), 1);
        assertEq(adapter.entryCount(_batchPayload(50)), 50);
        assertEq(adapter.entryCount(_batchPayload(800)), 800);
    }

    /// @dev Unknown or truncated payloads must degrade to a single entry rather than reverting
    ///      the send, so a future message type cannot brick the bridge.
    function test_EntryCount_UnknownPayloadDefaultsToOne() public view {
        assertEq(adapter.entryCount("test"), 1);
        assertEq(adapter.entryCount(""), 1);
        assertEq(adapter.entryCount(hex"deadbeef"), 1);
    }

    function test_QuoteMessage_ScalesWithBatchSize() public view {
        uint256 one = adapter.quoteMessage(HUB_DOMAIN, _batchPayload(1));
        uint256 fifty = adapter.quoteMessage(HUB_DOMAIN, _batchPayload(50));

        assertEq(one, (200_000 + 35_000) * 1 gwei);
        assertEq(fifty, (200_000 + 50 * 35_000) * 1 gwei);
        assertGt(fifty, one);
    }

    /// @dev quoteMessage and sendMessage must derive the identical gas limit, or a caller that
    ///      quotes and then sends the quoted amount in the same transaction reverts.
    function test_SendMessage_UsesQuotedGasLimit() public {
        bytes memory payload = _batchPayload(50);
        bytes32 recipient = bytes32(uint256(uint160(address(0x3))));
        uint256 fee = adapter.quoteMessage(HUB_DOMAIN, payload);

        vm.deal(user, fee);
        vm.prank(user);
        adapter.sendMessage{ value: fee }(HUB_DOMAIN, recipient, payload);

        assertEq(mailbox.lastGasLimit(), 200_000 + 50 * 35_000);
        assertEq(mailbox.lastValue(), fee);
    }

    /// @dev Overwrites the declared transactionCount without resizing the arrays, simulating a
    ///      payload that lies about its size. Cheaper than actually encoding millions of entries.
    function _withDeclaredCount(bytes memory payload, uint256 declared) internal pure returns (bytes memory) {
        // transactionCount occupies bytes [192:224] of the ABI head.
        assembly {
            mstore(add(payload, add(0x20, 192)), declared)
        }
        return payload;
    }

    /// @dev A payload claiming an absurd entry count must fail with a diagnosable error at quote
    ///      time rather than reverting on arithmetic overflow or quoting a nonsense fee.
    function test_GasLimitExceeded_Reverts() public {
        bytes memory payload = _withDeclaredCount(_batchPayload(1), 1_000_000);

        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__GasLimitExceeded.selector);
        adapter.quoteMessage(HUB_DOMAIN, payload);
    }

    /// @dev The same guard must hold against an overflow-sized count, not just a large one.
    function test_GasLimitExceeded_OverflowCount_Reverts() public {
        bytes memory payload = _withDeclaredCount(_batchPayload(1), type(uint256).max);

        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__GasLimitExceeded.selector);
        adapter.quoteMessage(HUB_DOMAIN, payload);
    }

    function test_GasLimitFor_MatchesModel() public view {
        assertEq(adapter.gasLimitFor(HUB_DOMAIN, _batchPayload(10)), 200_000 + 10 * 35_000);
    }
}
