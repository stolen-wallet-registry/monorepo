// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { CrossChainInbox } from "../src/CrossChainInbox.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ITransactionRegistry } from "../src/interfaces/ITransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { SpokeSoulboundForwarder } from "../src/spoke/SpokeSoulboundForwarder.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

/// @title RegistryHardeningTest
/// @notice Correctness fixes from the July 2026 code-review tail.
contract RegistryHardeningTest is Test {
    address internal owner;
    uint32 internal constant SPOKE_DOMAIN = 11_155_420;
    uint32 internal constant HUB_DOMAIN = 84_532;

    function setUp() public {
        vm.warp(1_704_067_200);
        owner = address(this);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // The end-to-end forgery test the CRITICAL finding asked for
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A random EOA calling sendMessage cannot cause a hub registration.
    /// @dev The original vulnerability: HyperlaneAdapter.sendMessage was permissionless while
    ///      the deploy script configured CrossChainInbox to trust the ADAPTER as the origin
    ///      sender (Hyperlane records the dispatcher, not its caller). Any EOA could therefore
    ///      dispatch a forged payload that the hub accepted as a legitimate spoke message,
    ///      permanently marking an arbitrary wallet as stolen with no EIP-712 signature, no
    ///      grace period and no fee.
    ///
    ///      Existing coverage only asserted the adapter-level revert. This drives the ACTUAL
    ///      attack from the attacker's entry point and asserts the victim is never registered —
    ///      the property that matters, and the one that would survive a refactor of the guard.
    function test_RandomEOACannotForgeHubRegistration() public {
        // ─── Hub side ───
        MockMailbox hubMailbox = new MockMailbox(HUB_DOMAIN);
        WalletRegistry walletRegistry = new WalletRegistry(owner, address(0), 2, 50);
        TransactionRegistry txRegistry = new TransactionRegistry(owner, address(0), 2, 50);
        ContractRegistry contractRegistry = new ContractRegistry(owner);
        FraudRegistryHub hub = new FraudRegistryHub(owner, makeAddr("feeRecipient"));

        hub.setWalletRegistry(address(walletRegistry));
        hub.setTransactionRegistry(address(txRegistry));
        hub.setContractRegistry(address(contractRegistry));
        walletRegistry.setHub(address(hub));
        txRegistry.setHub(address(hub));

        CrossChainInbox inbox = new CrossChainInbox(address(hubMailbox), address(hub), owner);
        hub.setInbox(address(inbox));

        // ─── Spoke side ───
        MockMailbox spokeMailbox = new MockMailbox(SPOKE_DOMAIN);
        HyperlaneAdapter adapter = new HyperlaneAdapter(owner, address(spokeMailbox));
        adapter.setDomainSupport(HUB_DOMAIN, true);

        // The deploy script trusts the ADAPTER address as the cross-chain source — this is the
        // configuration that made the permissionless adapter exploitable.
        inbox.setTrustedSource(SPOKE_DOMAIN, bytes32(uint256(uint160(address(adapter)))), true);

        // ─── Attack ───
        address attacker = makeAddr("attacker");
        address victim = makeAddr("victim");

        CrossChainMessage.WalletRegistrationPayload memory forged = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(victim))),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_DOMAIN)),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_DOMAIN)),
            incidentTimestamp: uint64(block.timestamp),
            registrationHash: bytes32(0),
            nonce: 0,
            timestamp: uint64(block.timestamp),
            isSponsored: false
        });

        vm.deal(attacker, 10 ether);
        vm.prank(attacker);
        vm.expectRevert(HyperlaneAdapter.HyperlaneAdapter__UnauthorizedSender.selector);
        adapter.sendMessage{ value: 1 ether }(
            HUB_DOMAIN, bytes32(uint256(uint160(address(inbox)))), CrossChainMessage.encodeWalletRegistration(forged)
        );

        // The property that actually matters: the victim was never registered.
        assertFalse(walletRegistry.isWalletRegistered(victim), "Forged message must never register a wallet");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // entryCount against real encoder output
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice entryCount reads a real encodeWalletRegistration payload as exactly one entry.
    /// @dev Existing coverage only fed hand-built batch payloads and junk strings, so the
    ///      wallet branch was proven by inspection rather than by test. A wallet message that
    ///      mis-parsed as a huge batch would revert every cross-chain registration on the gas
    ///      bound; one that mis-parsed as zero would under-fund it.
    function test_EntryCount_RealWalletPayloadIsOne() public {
        MockMailbox mailbox = new MockMailbox(SPOKE_DOMAIN);
        HyperlaneAdapter adapter = new HyperlaneAdapter(owner, address(mailbox));

        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(makeAddr("wallet")))),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_DOMAIN)),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_DOMAIN)),
            incidentTimestamp: uint64(block.timestamp),
            registrationHash: bytes32(0),
            nonce: 7,
            timestamp: uint64(block.timestamp),
            isSponsored: true
        });

        assertEq(adapter.entryCount(CrossChainMessage.encodeWalletRegistration(payload)), 1);
    }

    /// @notice The gas model can quote a batch at the spoke's maximum cross-chain size.
    /// @dev MAX_CROSS_CHAIN_BATCH_SIZE (SpokeRegistry) and MAX_GAS_LIMIT (HyperlaneAdapter) are
    ///      two constants in two contracts that only fit together by arithmetic: at the default
    ///      35,000 gas/entry, 800 entries needs 28.2M of the 30M cap. Nothing enforced that
    ///      relationship, so raising perEntryGas to 40,000 — a plausible response to a
    ///      destination gas-schedule change — would silently make every maximum-size batch
    ///      unquotable for the entire acknowledgement window, with no way to complete it.
    function test_GasModel_SupportsMaxCrossChainBatch() public {
        MockMailbox mailbox = new MockMailbox(SPOKE_DOMAIN);
        HyperlaneAdapter adapter = new HyperlaneAdapter(owner, address(mailbox));
        adapter.setDomainSupport(HUB_DOMAIN, true);

        uint256 maxEntries = new SpokeRegistry(
                owner, address(adapter), address(0), HUB_DOMAIN, bytes32(uint256(1)), 2, 50, 1
            ).MAX_CROSS_CHAIN_BATCH_SIZE();

        uint256 required = adapter.DEFAULT_BASE_GAS() + (adapter.DEFAULT_PER_ENTRY_GAS() * maxEntries);
        assertLe(required, adapter.MAX_GAS_LIMIT(), "A max-size spoke batch must be quotable by the adapter");
    }

    /// @notice The hub's two-phase bound matches the spoke's cross-chain bound.
    /// @dev If the hub bound were lower, a batch the spoke accepted and charged for could not be
    ///      executed on arrival.
    function test_TwoPhaseBoundMatchesSpokeCrossChainBound() public {
        MockMailbox mailbox = new MockMailbox(SPOKE_DOMAIN);
        HyperlaneAdapter adapter = new HyperlaneAdapter(owner, address(mailbox));
        SpokeRegistry spoke =
            new SpokeRegistry(owner, address(adapter), address(0), HUB_DOMAIN, bytes32(uint256(1)), 2, 50, 1);
        TransactionRegistry txRegistry = new TransactionRegistry(owner, address(0), 2, 50);

        assertEq(
            uint256(spoke.MAX_CROSS_CHAIN_BATCH_SIZE()),
            txRegistry.MAX_TWO_PHASE_BATCH_SIZE(),
            "Spoke and hub two-phase batch bounds must agree"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // incidentTimestamp range validation
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice An operator batch with a future incident timestamp is rejected.
    /// @dev incidentTimestamp flows unvalidated into permanent storage and feeds the indexer,
    ///      dashboard and any downstream fraud scoring. A future value is unfalsifiable at
    ///      write time and permanently poisons time-based analytics (claiming a theft in 2099).
    ///      0 remains valid — it is the established "unknown" sentinel that the web app and the
    ///      operator CLI both submit today.
    function test_OperatorBatch_RejectsFutureIncidentTimestamp() public {
        WalletRegistry registry = new WalletRegistry(owner, address(0), 2, 50);
        registry.setOperatorSubmitter(owner);

        bytes32[] memory identifiers = new bytes32[](1);
        bytes32[] memory chainIds = new bytes32[](1);
        uint64[] memory incidentTimestamps = new uint64[](1);
        identifiers[0] = bytes32(uint256(uint160(makeAddr("w1"))));
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(8453));
        incidentTimestamps[0] = uint64(block.timestamp + 1 days);

        vm.expectRevert(IWalletRegistry.WalletRegistry__InvalidIncidentTimestamp.selector);
        registry.registerWalletsFromOperator(keccak256("op"), identifiers, chainIds, incidentTimestamps);
    }

    /// @notice 0 ("unknown") is still accepted — it is what the app and CLI send today.
    function test_OperatorBatch_AcceptsZeroIncidentTimestamp() public {
        WalletRegistry registry = new WalletRegistry(owner, address(0), 2, 50);
        registry.setOperatorSubmitter(owner);

        bytes32[] memory identifiers = new bytes32[](1);
        bytes32[] memory chainIds = new bytes32[](1);
        uint64[] memory incidentTimestamps = new uint64[](1);
        address wallet = makeAddr("w2");
        identifiers[0] = bytes32(uint256(uint160(wallet)));
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(8453));
        incidentTimestamps[0] = 0;

        registry.registerWalletsFromOperator(keccak256("op"), identifiers, chainIds, incidentTimestamps);

        assertTrue(registry.isWalletRegistered(wallet));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Empty-batch consistency
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice A wallet batch where every entry is already registered reverts.
    /// @dev Matches ContractRegistry (and now TransactionRegistry). Previously the operator paid
    ///      full gas for a complete no-op, a batch ID was burned, and the indexer materialised a
    ///      phantom zero-entry batch with no per-entry events to join against.
    function test_WalletOperatorBatch_RevertsWhenEveryEntryIsDuplicate() public {
        WalletRegistry registry = new WalletRegistry(owner, address(0), 2, 50);
        registry.setOperatorSubmitter(owner);

        bytes32[] memory identifiers = new bytes32[](1);
        bytes32[] memory chainIds = new bytes32[](1);
        uint64[] memory incidentTimestamps = new uint64[](1);
        identifiers[0] = bytes32(uint256(uint160(makeAddr("dupe"))));
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(8453));
        incidentTimestamps[0] = 0;

        registry.registerWalletsFromOperator(keccak256("op1"), identifiers, chainIds, incidentTimestamps);

        vm.expectRevert(IWalletRegistry.WalletRegistry__EmptyBatch.selector);
        registry.registerWalletsFromOperator(keccak256("op2"), identifiers, chainIds, incidentTimestamps);
    }

    /// @notice A batch of only zero identifiers reverts rather than burning a batch ID.
    function test_WalletOperatorBatch_RevertsWhenAllIdentifiersZero() public {
        WalletRegistry registry = new WalletRegistry(owner, address(0), 2, 50);
        registry.setOperatorSubmitter(owner);

        bytes32[] memory identifiers = new bytes32[](2);
        bytes32[] memory chainIds = new bytes32[](2);
        uint64[] memory incidentTimestamps = new uint64[](2);
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(8453));
        chainIds[1] = chainIds[0];

        vm.expectRevert(IWalletRegistry.WalletRegistry__EmptyBatch.selector);
        registry.registerWalletsFromOperator(keccak256("op"), identifiers, chainIds, incidentTimestamps);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Two-phase batch bounds
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Phase 1 rejects a transaction count larger than phase 2 could ever execute.
    /// @dev Committing a count upfront is not a bound. Without this a user could acknowledge a
    ///      count too large to fit in a block, then be unable to complete registration until
    ///      the acknowledgement expired — having already paid and consumed a nonce.
    function test_AcknowledgeTransactions_RejectsOversizedCount() public {
        TransactionRegistry registry = new TransactionRegistry(owner, address(0), 2, 50);
        uint32 tooMany = uint32(registry.MAX_TWO_PHASE_BATCH_SIZE() + 1);

        vm.expectRevert(ITransactionRegistry.TransactionRegistry__BatchTooLarge.selector);
        registry.acknowledgeTransactions(
            makeAddr("reporter"),
            makeAddr("forwarder"),
            block.timestamp + 1 hours,
            keccak256("dataHash"),
            CAIP10Evm.caip2Hash(uint64(8453)),
            tooMany,
            27,
            bytes32(0),
            bytes32(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SpokeSoulboundForwarder must be able to receive an IGP refund
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice The forwarder accepts plain ETH transfers.
    /// @dev It is passed as the refund address in the adapter's hook metadata, and Hyperlane's
    ///      IGP requires that refund transfer to succeed. Without a receive(), any hook that
    ///      over-estimated its own postDispatch cost would turn every cross-chain soulbound
    ///      mint into a revert. SpokeRegistry already had one; this contract did not.
    function test_Forwarder_AcceptsPlainEthTransfer() public {
        MockMailbox mailbox = new MockMailbox(SPOKE_DOMAIN);
        HyperlaneAdapter adapter = new HyperlaneAdapter(owner, address(mailbox));
        SpokeSoulboundForwarder forwarder =
            new SpokeSoulboundForwarder(owner, address(adapter), HUB_DOMAIN, bytes32(uint256(1)), 0.001 ether);

        (bool ok,) = address(forwarder).call{ value: 1 ether }("");

        assertTrue(ok, "Forwarder must accept an IGP refund");
        assertEq(address(forwarder).balance, 1 ether);
    }
}
