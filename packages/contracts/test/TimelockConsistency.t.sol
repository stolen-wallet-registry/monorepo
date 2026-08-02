// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { CrossChainInbox } from "../src/CrossChainInbox.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { ISoulboundReceiver } from "../src/interfaces/ISoulboundReceiver.sol";
import { OperatorSubmitter } from "../src/OperatorSubmitter.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { IOperatorRegistry } from "../src/interfaces/IOperatorRegistry.sol";
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { TimelockOwnable } from "../src/libraries/TimelockOwnable.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

/// @title TimelockConsistencyTest
/// @notice Every trust-boundary setter must be timelocked after completeSetup().
/// @dev The critical fix for the permissionless-adapter vulnerability introduced an
///      `authorizedSenders` allowlist on HyperlaneAdapter, but left the setter itself as a
///      one-transaction owner call on a plain Ownable2Step contract — so a compromised spoke
///      owner key could re-authorize itself and reproduce the original forgery with no delay,
///      while four sibling contracts had already moved to TimelockOwnable. These tests pin the
///      boundary for each contract that was inconsistent.
///
///      Shared model: GRANTS (anything that widens what can be written or dispatched) are
///      timelocked once setup is complete; REVOCATIONS stay immediate, because they only ever
///      narrow access and are the emergency response to a compromise.
contract TimelockConsistencyTest is Test {
    address internal owner;
    uint32 internal constant HUB_DOMAIN = 8453;
    uint32 internal constant SPOKE_DOMAIN = 11_155_420; // OP Sepolia
    bytes32 internal constant SPOKE_BYTES32 = bytes32(uint256(uint160(0xBEEF)));

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01
        owner = address(this);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HyperlaneAdapter — the allowlist that closes the CRITICAL finding
    // ═══════════════════════════════════════════════════════════════════════════

    function _adapter() internal returns (HyperlaneAdapter) {
        MockMailbox mailbox = new MockMailbox(31_337);
        return new HyperlaneAdapter(owner, address(mailbox));
    }

    /// @notice Granting dispatch rights is immediate during setup (deploy scripts rely on it).
    function test_Adapter_AuthorizeImmediateDuringSetup() public {
        HyperlaneAdapter adapter = _adapter();
        address spoke = makeAddr("spokeRegistry");

        adapter.setAuthorizedSender(spoke, true);

        assertTrue(adapter.authorizedSenders(spoke));
    }

    /// @notice After completeSetup(), granting dispatch rights in one transaction is rejected.
    /// @dev This is the whole point: an owner key that can grant dispatch rights can mint a
    ///      universal forgery oracle, because the destination inbox trusts the ADAPTER as the
    ///      origin sender for anything it dispatches.
    function test_Adapter_AuthorizeBlockedAfterSetup() public {
        HyperlaneAdapter adapter = _adapter();
        adapter.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        adapter.setAuthorizedSender(makeAddr("attacker"), true);
    }

    /// @notice Revoking stays immediate after setup — narrowing access is an emergency action.
    function test_Adapter_RevokeStaysImmediateAfterSetup() public {
        HyperlaneAdapter adapter = _adapter();
        address spoke = makeAddr("spokeRegistry");
        adapter.setAuthorizedSender(spoke, true);
        adapter.completeSetup();

        adapter.setAuthorizedSender(spoke, false);

        assertFalse(adapter.authorizedSenders(spoke), "Revocation must not require the timelock");
    }

    /// @notice The propose → wait → activate path grants after the full delay.
    function test_Adapter_AuthorizeViaTimelock() public {
        HyperlaneAdapter adapter = _adapter();
        adapter.completeSetup();
        address newSpoke = makeAddr("newSpoke");

        adapter.proposeAuthorizedSender(newSpoke);

        // Too early
        vm.warp(block.timestamp + adapter.ACTIVATION_DELAY() - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        adapter.activateAuthorizedSender(newSpoke);

        vm.warp(block.timestamp + 1);
        adapter.activateAuthorizedSender(newSpoke);

        assertTrue(adapter.authorizedSenders(newSpoke));
    }

    /// @notice Activation only ever applies the exact address that was proposed.
    function test_Adapter_ActivateRejectsUnproposedAddress() public {
        HyperlaneAdapter adapter = _adapter();
        adapter.completeSetup();

        adapter.proposeAuthorizedSender(makeAddr("proposed"));
        vm.warp(block.timestamp + adapter.ACTIVATION_DELAY());

        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        adapter.activateAuthorizedSender(makeAddr("somethingElse"));
    }

    /// @notice Enabling a destination domain is timelocked; disabling is not.
    function test_Adapter_DomainSupportGrantTimelockedRevokeImmediate() public {
        HyperlaneAdapter adapter = _adapter();
        adapter.setDomainSupport(HUB_DOMAIN, true);
        adapter.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        adapter.setDomainSupport(999, true);

        // Disabling still works
        adapter.setDomainSupport(HUB_DOMAIN, false);
        assertFalse(adapter.supportsChain(HUB_DOMAIN));

        // And the timelocked path can re-enable
        adapter.proposeDomainSupport(HUB_DOMAIN);
        vm.warp(block.timestamp + adapter.ACTIVATION_DELAY());
        adapter.activateDomainSupport(HUB_DOMAIN);
        assertTrue(adapter.supportsChain(HUB_DOMAIN));
    }

    /// @notice addDomains is a setup-only convenience and closes with setup.
    function test_Adapter_AddDomainsBlockedAfterSetup() public {
        HyperlaneAdapter adapter = _adapter();
        adapter.completeSetup();

        uint32[] memory domains = new uint32[](1);
        domains[0] = 10;

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        adapter.addDomains(domains);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OperatorSubmitter — the three registry setters left immediate
    // ═══════════════════════════════════════════════════════════════════════════

    function _submitter() internal returns (OperatorSubmitter) {
        WalletRegistry walletReg = new WalletRegistry(owner, address(0), 2, 50);
        TransactionRegistry txReg = new TransactionRegistry(owner, address(0), 2, 50);
        ContractRegistry contractReg = new ContractRegistry(owner);
        OperatorRegistry operatorReg = new OperatorRegistry(owner);

        return new OperatorSubmitter(
            owner,
            address(walletReg),
            address(txReg),
            address(contractReg),
            address(operatorReg),
            address(0),
            address(0)
        );
    }

    /// @notice Repointing a registry post-setup requires the timelock.
    /// @dev Same class as setOperatorRegistry, which was already timelocked in this contract:
    ///      a swapped registry silently redirects every operator batch — submissions appear to
    ///      succeed, land nowhere the indexer reads, and nobody gets a window to react.
    function test_Submitter_RegistrySettersBlockedAfterSetup() public {
        OperatorSubmitter submitter = _submitter();
        submitter.completeSetup();
        address sink = makeAddr("sink");

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setWalletRegistry(sink);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setTransactionRegistry(sink);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setContractRegistry(sink);
    }

    /// @notice Each registry setter has a working propose/activate path.
    function test_Submitter_RegistrySettersViaTimelock() public {
        OperatorSubmitter submitter = _submitter();
        submitter.completeSetup();
        address newWallet = makeAddr("newWalletRegistry");
        address newTx = makeAddr("newTxRegistry");
        address newContract = makeAddr("newContractRegistry");

        submitter.proposeWalletRegistry(newWallet);
        submitter.proposeTransactionRegistry(newTx);
        submitter.proposeContractRegistry(newContract);

        vm.warp(block.timestamp + submitter.ACTIVATION_DELAY());

        submitter.activateWalletRegistry(newWallet);
        submitter.activateTransactionRegistry(newTx);
        submitter.activateContractRegistry(newContract);

        assertEq(submitter.walletRegistry(), newWallet);
        assertEq(submitter.transactionRegistry(), newTx);
        assertEq(submitter.contractRegistry(), newContract);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OperatorRegistry — capability escalation bypassed the approval timelock
    // ═══════════════════════════════════════════════════════════════════════════

    function _registryWithOperator(address operator, uint8 caps) internal returns (OperatorRegistry) {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.approveOperator(operator, caps, "test-operator");
        return reg;
    }

    /// @notice Escalating capabilities post-setup requires the timelock.
    /// @dev Without this the 2-day delay on approveOperator was fully bypassable: approve an
    ///      operator with a benign capability through the timelocked path, then escalate to
    ///      ALL_REGISTRIES in one transaction — granting instant access to
    ///      ContractRegistry.registerContractsFromOperator, which is operator-only precisely
    ///      because it has no two-phase EIP-712 protection.
    function test_OperatorRegistry_EscalationBlockedAfterSetup() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 1); // WALLET_REGISTRY only
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.updateCapabilities(operator, 7); // ALL_REGISTRIES
    }

    /// @notice Reducing capabilities stays immediate, matching revokeOperator.
    function test_OperatorRegistry_ReductionStaysImmediateAfterSetup() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 7); // ALL_REGISTRIES
        reg.completeSetup();

        reg.updateCapabilities(operator, 1); // narrow to WALLET_REGISTRY

        assertEq(reg.getOperator(operator).capabilities, 1);
    }

    /// @notice A LATERAL capability change — reduction and escalation at once — is blocked.
    /// @dev This is the case that actually pins the bitmask semantics at OperatorRegistry.sol:146
    ///      (`capabilities & ~op.capabilities != 0`). The 1→7 and 7→1 cases above do NOT: they
    ///      behave identically under the correct bitmask check and under a naive numeric
    ///      `capabilities > op.capabilities`, so neither would catch a regression to the latter.
    ///
    ///      3 (0b011 = WALLET|TRANSACTION) → 5 (0b101 = WALLET|CONTRACT) drops the TRANSACTION
    ///      bit while ADDING the CONTRACT bit, and 5 > 3 is false. A naive numeric check would
    ///      wave it through, handing instant access to
    ///      ContractRegistry.registerContractsFromOperator — the operator-only path that has no
    ///      two-phase EIP-712 protection — with no timelock and no warning. That is the exact
    ///      escalation this control exists to stop, arrived at sideways.
    function test_OperatorRegistry_LateralCapabilityChangeBlockedAfterSetup() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 3); // WALLET | TRANSACTION
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.updateCapabilities(operator, 5); // WALLET | CONTRACT

        assertEq(reg.getOperator(operator).capabilities, 3, "capabilities must be unchanged");
    }

    /// @notice The strictly-numeric-decrease lateral case: 6 (0b110) → 5 (0b101) is still blocked.
    /// @dev The sharper half of the test above, and the one a naive `>` check provably fails.
    ///      5 < 6, so a numeric comparison reads this as a REDUCTION and lets it through
    ///      immediately — yet 0b101 adds the WALLET bit that 0b110 does not have. Only the
    ///      `newCaps & ~oldCaps != 0` form rejects it. If this test ever passes while
    ///      test_OperatorRegistry_LateralCapabilityChangeBlockedAfterSetup fails, the
    ///      implementation has silently reverted to a numeric comparison.
    function test_OperatorRegistry_NumericallySmallerLateralChangeBlockedAfterSetup() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 6); // TRANSACTION | CONTRACT
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.updateCapabilities(operator, 5); // CONTRACT | WALLET — numerically smaller, still an escalation

        assertEq(reg.getOperator(operator).capabilities, 6, "capabilities must be unchanged");
    }

    /// @notice A lateral change is still reachable through the timelock, not permanently blocked.
    /// @dev The guard must gate the escalation behind the delay, not forbid the transition. Without
    ///      this the two tests above would also pass against an implementation that rejected every
    ///      lateral change outright, which would be a denial of service on legitimate re-scoping.
    function test_OperatorRegistry_LateralCapabilityChangeViaTimelock() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 3); // WALLET | TRANSACTION
        reg.completeSetup();

        reg.proposeCapabilities(operator, 5);
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY());
        reg.activateCapabilities(operator, 5);

        assertEq(reg.getOperator(operator).capabilities, 5);
    }

    /// @notice Escalation works through propose → wait → activate.
    function test_OperatorRegistry_EscalationViaTimelock() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 1);
        reg.completeSetup();

        reg.proposeCapabilities(operator, 7);

        vm.warp(block.timestamp + reg.ACTIVATION_DELAY() - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        reg.activateCapabilities(operator, 7);

        vm.warp(block.timestamp + 1);
        reg.activateCapabilities(operator, 7);

        assertEq(reg.getOperator(operator).capabilities, 7);
    }

    /// @notice An operator revoked during the delay cannot be silently re-empowered.
    /// @dev Revocation is immediate by design, so it can land inside the 2-day window. If
    ///      activation did not re-check approval, it would hand capabilities back to an
    ///      operator the DAO had just cut off — defeating the emergency revoke.
    function test_OperatorRegistry_ActivationRejectsRevokedOperator() public {
        address operator = makeAddr("operator");
        OperatorRegistry reg = _registryWithOperator(operator, 1);
        reg.completeSetup();

        reg.proposeCapabilities(operator, 7);
        reg.revokeOperator(operator); // emergency action during the delay
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY());

        vm.expectRevert(IOperatorRegistry.OperatorRegistry__NotApproved.selector);
        reg.activateCapabilities(operator, 7);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SpokeRegistry — hubInbox is where every registration lands
    // ═══════════════════════════════════════════════════════════════════════════

    function _spoke() internal returns (SpokeRegistry) {
        MockMailbox mailbox = new MockMailbox(31_337);
        HyperlaneAdapter adapter = new HyperlaneAdapter(owner, address(mailbox));
        return new SpokeRegistry(
            owner, address(adapter), address(0), HUB_DOMAIN, bytes32(uint256(uint160(makeAddr("hubInbox")))), 2, 50, 1
        );
    }

    /// @notice Repointing the hub post-setup requires the timelock.
    /// @dev hubInbox is the destination for every registration this contract accepts and is
    ///      paid for; a one-transaction swap would silently divert users' paid registrations.
    function test_Spoke_SetHubConfigBlockedAfterSetup() public {
        SpokeRegistry spoke = _spoke();
        spoke.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        spoke.setHubConfig(HUB_DOMAIN, bytes32(uint256(uint160(makeAddr("attackerInbox")))));
    }

    /// @notice Hub config changes work through propose → wait → activate.
    function test_Spoke_SetHubConfigViaTimelock() public {
        SpokeRegistry spoke = _spoke();
        spoke.completeSetup();
        bytes32 newInbox = bytes32(uint256(uint160(makeAddr("newInbox"))));

        spoke.proposeHubConfig(HUB_DOMAIN, newInbox);
        vm.warp(block.timestamp + spoke.ACTIVATION_DELAY());
        spoke.activateHubConfig(HUB_DOMAIN, newInbox);

        assertEq(spoke.hubInbox(), newInbox);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CrossChainInbox — the revoke path that was blocked along with the grant
    // ═══════════════════════════════════════════════════════════════════════════

    function _inbox() internal returns (CrossChainInbox) {
        MockMailbox mailbox = new MockMailbox(HUB_DOMAIN);
        FraudRegistryHub hub = new FraudRegistryHub(owner, makeAddr("feeRecipient"));
        return new CrossChainInbox(address(mailbox), address(hub), owner);
    }

    /// @notice Trusting a spoke is immediate during setup (deploy scripts rely on it).
    function test_Inbox_TrustImmediateDuringSetup() public {
        CrossChainInbox inbox = _inbox();

        inbox.setTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32, true);

        assertTrue(inbox.isTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32));
    }

    /// @notice After completeSetup(), trusting a new spoke in one transaction is rejected.
    /// @dev A trusted source's messages reach WalletRegistry.registerFromHub, which performs no
    ///      signature check — granting trust is the widest write capability in the system.
    function test_Inbox_TrustBlockedAfterSetup() public {
        CrossChainInbox inbox = _inbox();
        inbox.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        inbox.setTrustedSource(SPOKE_DOMAIN, bytes32(uint256(uint160(makeAddr("attackerSpoke")))), true);
    }

    /// @notice Un-trusting a compromised spoke stays immediate after setup.
    /// @dev This is the finding: the setter was `onlyDuringSetup` unconditionally, so cutting off
    ///      a spoke that was forging registrations required propose → 2 days → activate, and the
    ///      only immediate lever was the hub-wide pause that also stops every honest spoke.
    function test_Inbox_UntrustStaysImmediateAfterSetup() public {
        CrossChainInbox inbox = _inbox();
        inbox.setTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32, true);
        inbox.completeSetup();

        inbox.setTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32, false);

        assertFalse(inbox.isTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32), "Revocation must not require the timelock");
    }

    /// @notice The propose → wait → activate path can (re-)trust a spoke after the full delay.
    function test_Inbox_TrustViaTimelock() public {
        CrossChainInbox inbox = _inbox();
        inbox.completeSetup();

        inbox.proposeTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32, true);

        vm.warp(block.timestamp + inbox.ACTIVATION_DELAY() - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        inbox.activateTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32, true);

        vm.warp(block.timestamp + 1);
        inbox.activateTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32, true);

        assertTrue(inbox.isTrustedSource(SPOKE_DOMAIN, SPOKE_BYTES32));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SoulboundReceiver — a domain could never be un-trusted at all
    // ═══════════════════════════════════════════════════════════════════════════

    function _receiver() internal returns (SoulboundReceiver, address) {
        MockMailbox mailbox = new MockMailbox(HUB_DOMAIN);
        SoulboundReceiver receiver =
            new SoulboundReceiver(owner, address(mailbox), makeAddr("walletSoulbound"), makeAddr("supportSoulbound"));
        return (receiver, address(mailbox));
    }

    /// @notice Pointing a domain at its forwarder is immediate during setup.
    function test_Receiver_SetForwarderImmediateDuringSetup() public {
        (SoulboundReceiver receiver,) = _receiver();
        address forwarder = makeAddr("spokeForwarder");

        receiver.setTrustedForwarder(SPOKE_DOMAIN, forwarder);

        assertEq(receiver.trustedForwarders(SPOKE_DOMAIN), forwarder);
    }

    /// @notice After completeSetup(), pointing a domain at a new forwarder requires the timelock.
    function test_Receiver_SetForwarderBlockedAfterSetup() public {
        (SoulboundReceiver receiver,) = _receiver();
        receiver.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        receiver.setTrustedForwarder(SPOKE_DOMAIN, makeAddr("attackerForwarder"));
    }

    /// @notice Un-trusting a domain (forwarder = address(0)) stays immediate after setup.
    /// @dev Previously impossible in any form: the setter was `onlyDuringSetup` AND both the
    ///      immediate and the timelocked paths rejected address(0), so a compromised forwarder
    ///      could only be *repointed* after 2 days, never cut off.
    function test_Receiver_UntrustStaysImmediateAfterSetup() public {
        (SoulboundReceiver receiver,) = _receiver();
        address forwarder = makeAddr("spokeForwarder");
        receiver.setTrustedForwarder(SPOKE_DOMAIN, forwarder);
        receiver.completeSetup();

        receiver.setTrustedForwarder(SPOKE_DOMAIN, address(0));

        assertEq(receiver.trustedForwarders(SPOKE_DOMAIN), address(0), "Revocation must not require the timelock");
    }

    /// @notice The propose → wait → activate path still grants forwarder trust after setup.
    function test_Receiver_SetForwarderViaTimelock() public {
        (SoulboundReceiver receiver,) = _receiver();
        receiver.completeSetup();
        address forwarder = makeAddr("newForwarder");

        receiver.proposeTrustedForwarder(SPOKE_DOMAIN, forwarder);

        vm.warp(block.timestamp + receiver.ACTIVATION_DELAY() - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        receiver.activateTrustedForwarder(SPOKE_DOMAIN, forwarder);

        vm.warp(block.timestamp + 1);
        receiver.activateTrustedForwarder(SPOKE_DOMAIN, forwarder);

        assertEq(receiver.trustedForwarders(SPOKE_DOMAIN), forwarder);
    }

    /// @notice pause() is the receiver's kill switch and unpause() fully restores handling.
    /// @dev The receiver had no pause at all, so a forwarder compromise had no global stop.
    ///      The unpaused half asserts the modifier is actually off: the call gets past
    ///      whenNotPaused and fails later, on the forwarder-trust check.
    function test_Receiver_PauseBlocksHandleUnpauseRestores() public {
        (SoulboundReceiver receiver, address mailbox) = _receiver();
        bytes memory message = abi.encode(uint8(1), makeAddr("wallet"), address(0), uint256(0));
        bytes32 sender = bytes32(uint256(uint160(makeAddr("untrusted"))));

        receiver.pause();
        assertTrue(receiver.paused());

        vm.prank(mailbox);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        receiver.handle(SPOKE_DOMAIN, sender, message);

        receiver.unpause();
        assertFalse(receiver.paused());

        vm.prank(mailbox);
        vm.expectRevert(ISoulboundReceiver.SoulboundReceiver__UntrustedForwarder.selector);
        receiver.handle(SPOKE_DOMAIN, sender, message);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Ownership — custody of the timelock is itself a trust boundary
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Ownership handover is immediate during setup (deploy → hand to multisig).
    function test_Ownership_TransferImmediateDuringSetup() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        address newOwner = makeAddr("multisig");

        reg.transferOwnership(newOwner);
        vm.prank(newOwner);
        reg.acceptOwnership();

        assertEq(reg.owner(), newOwner);
    }

    /// @notice After completeSetup(), a compromised owner key cannot hand over ownership instantly.
    /// @dev The timelock guarded individual actions but not custody of the timelock. One
    ///      transferOwnership + acceptOwnership handed an attacker every NON-timelocked lever at
    ///      once — revoke every operator, pause everything, cancelAction on the DAO's own recovery
    ///      proposals — with zero delay and zero warning.
    function test_Ownership_TransferBlockedAfterSetup() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.transferOwnership(makeAddr("attacker"));

        assertEq(reg.pendingOwner(), address(0));
        assertEq(reg.owner(), owner);
    }

    /// @notice The legitimate handover still works end to end: propose → wait → activate → accept.
    function test_Ownership_TransferViaTimelock() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();
        address dao = makeAddr("dao");

        reg.proposeOwnershipTransfer(dao);

        vm.warp(block.timestamp + reg.ACTIVATION_DELAY() - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        reg.activateOwnershipTransfer(dao);

        vm.warp(block.timestamp + 1);
        reg.activateOwnershipTransfer(dao);

        // Activation only starts the Ownable2Step handshake
        assertEq(reg.pendingOwner(), dao);
        assertEq(reg.owner(), owner);

        vm.prank(dao);
        reg.acceptOwnership();

        assertEq(reg.owner(), dao);
        assertEq(reg.pendingOwner(), address(0));
    }

    /// @notice Activation applies only the exact address that was proposed.
    function test_Ownership_ActivateRejectsUnproposedAddress() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();

        reg.proposeOwnershipTransfer(makeAddr("dao"));
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY());

        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        reg.activateOwnershipTransfer(makeAddr("attacker"));
    }

    /// @notice A pending handover can be cancelled immediately, before the new owner accepts.
    /// @dev Clearing pendingOwner only ever narrows access, so it must not itself be timelocked —
    ///      otherwise a proposal activated under duress would be un-stoppable during the window
    ///      between activation and acceptance.
    function test_Ownership_CancelPendingTransferStaysImmediate() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();
        address dao = makeAddr("dao");

        reg.proposeOwnershipTransfer(dao);
        vm.warp(block.timestamp + reg.ACTIVATION_DELAY());
        reg.activateOwnershipTransfer(dao);

        reg.transferOwnership(address(0));
        assertEq(reg.pendingOwner(), address(0));

        vm.prank(dao);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", dao));
        reg.acceptOwnership();
    }

    /// @notice Proposing the zero address is rejected — it is not a handover, it is a cancel.
    function test_Ownership_ProposeZeroAddressReverts() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__ZeroAddress.selector);
        reg.proposeOwnershipTransfer(address(0));
    }

    /// @notice Renouncing is still possible while the contract is not yet live.
    function test_Ownership_RenounceAllowedDuringSetup() public {
        OperatorRegistry reg = new OperatorRegistry(owner);

        reg.renounceOwnership();

        assertEq(reg.owner(), address(0));
    }

    /// @notice After completeSetup(), renouncing is permanently disabled.
    /// @dev The inverse of the seizure: an owner-less live contract can never activate a
    ///      timelocked setter, never revoke a compromised operator or spoke, and never pause.
    ///      The config and the trust boundaries freeze forever.
    function test_Ownership_RenounceBlockedAfterSetup() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__RenounceDisabled.selector);
        reg.renounceOwnership();

        assertEq(reg.owner(), owner);
    }
}
