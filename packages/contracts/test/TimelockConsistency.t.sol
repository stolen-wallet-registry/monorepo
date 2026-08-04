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
import { FeeManager } from "../src/FeeManager.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

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

    /// @notice The fee pointers — the state that MOVES MONEY — are timelocked after setup.
    /// @dev SECURITY-CRITICAL (C-3). `_collectFee` pushes the collected fee straight to
    ///      `feeRecipient`, so `feeRecipient` is not a pointer to data, it IS the money.
    ///      These three setters were the only owner calls on this contract still executable in
    ///      one transaction, which made `setFeeRecipient(attacker)` a complete, instant, and
    ///      undelayed diversion of all future operator fees — on a contract whose every other
    ///      pointer already carried the 2-day delay.
    function test_Submitter_FeeSettersBlockedAfterSetup() public {
        OperatorSubmitter submitter = _submitter();
        submitter.completeSetup();
        address attacker = makeAddr("attacker");

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setFeeRecipient(attacker);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setFeeManager(makeAddr("hostileFeeManager"));

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setFeeConfig(makeAddr("hostileFeeManager"), attacker);

        assertEq(submitter.feeRecipient(), address(0), "Fee recipient must be unchanged");
        assertEq(submitter.feeManager(), address(0), "Fee manager must be unchanged");
    }

    /// @notice Each fee setter has a working propose → wait → activate path.
    function test_Submitter_FeeSettersViaTimelock() public {
        OperatorSubmitter submitter = _submitter();
        submitter.completeSetup();
        address recipient = makeAddr("treasury");
        address fm = makeAddr("feeManager");

        // Recipient first: _setFeeManager rejects enabling fees with no recipient.
        submitter.proposeFeeRecipient(recipient);
        vm.warp(block.timestamp + submitter.ACTIVATION_DELAY());
        submitter.activateFeeRecipient(recipient);
        assertEq(submitter.feeRecipient(), recipient);

        submitter.proposeFeeManager(fm);
        vm.warp(block.timestamp + submitter.ACTIVATION_DELAY());
        submitter.activateFeeManager(fm);
        assertEq(submitter.feeManager(), fm);

        // And the atomic pair, which carries its own action key.
        address fm2 = makeAddr("feeManager2");
        address recipient2 = makeAddr("treasury2");
        submitter.proposeFeeConfig(fm2, recipient2);
        vm.warp(block.timestamp + submitter.ACTIVATION_DELAY());
        submitter.activateFeeConfig(fm2, recipient2);
        assertEq(submitter.feeManager(), fm2);
        assertEq(submitter.feeRecipient(), recipient2);
    }

    /// @notice Activation applies only the exact fee configuration that was proposed.
    /// @dev The delay is worthless if the activation arguments are unconstrained — an owner could
    ///      propose a benign recipient, wait out the two days in public, then activate a different
    ///      one. Also pins that a single-pointer proposal cannot be activated as an atomic pair:
    ///      the two paths hash different action keys.
    function test_Submitter_FeeActivationRejectsUnproposedValues() public {
        OperatorSubmitter submitter = _submitter();
        submitter.completeSetup();
        address proposed = makeAddr("proposedTreasury");

        submitter.proposeFeeRecipient(proposed);
        vm.warp(block.timestamp + submitter.ACTIVATION_DELAY());

        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        submitter.activateFeeRecipient(makeAddr("attacker"));

        // A setFeeRecipient proposal is not a setFeeConfig proposal.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        submitter.activateFeeConfig(address(0), proposed);

        submitter.activateFeeRecipient(proposed);
        assertEq(submitter.feeRecipient(), proposed);
    }

    /// @notice Fee setters stay immediate during setup, so deploy scripts keep working.
    function test_Submitter_FeeSettersImmediateDuringSetup() public {
        OperatorSubmitter submitter = _submitter();
        address recipient = makeAddr("treasury");
        address fm = makeAddr("feeManager");

        submitter.setFeeConfig(fm, recipient);

        assertEq(submitter.feeManager(), fm);
        assertEq(submitter.feeRecipient(), recipient);
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
    // FeeManager — the contract that prices every registration
    // ═══════════════════════════════════════════════════════════════════════════

    function _feeManager() internal returns (FeeManager) {
        MockAggregator agg = new MockAggregator(300_000_000_000); // $3,000, 8 decimals
        return new FeeManager(owner, address(agg));
    }

    /// @notice Every immediate setter still works before completeSetup(), so deploy scripts do too.
    function test_FeeManager_SettersImmediateDuringSetup() public {
        FeeManager fm = _feeManager();

        fm.setBaseFee(1000);
        fm.setOperatorBatchFee(250);
        fm.setFallbackPrice(350_000);
        fm.setStalePriceThreshold(1 hours);
        fm.setPriceBounds(200_000, 400_000);
        fm.setPriceFeed(makeAddr("otherFeed"));

        assertEq(fm.baseFeeUsdCents(), 1000);
        assertEq(fm.operatorBatchFeeUsdCents(), 250);
        assertEq(fm.fallbackEthPriceUsdCents(), 350_000);
        assertEq(fm.stalePriceThreshold(), 1 hours);
        assertEq(fm.minEthPriceUsdCents(), 200_000);
        assertEq(fm.priceFeed(), makeAddr("otherFeed"));
    }

    /// @notice After completeSetup(), no FeeManager setter executes in a single transaction.
    /// @dev SECURITY-CRITICAL. FeeManager was the one TimelockOwnable contract with no assertion
    ///      in this file, and its own test file never called completeSetup() — so every one of its
    ///      tests ran with `setupComplete == false` and the entire gate was unverified. Deleting
    ///      `onlyDuringSetup` from any setter below used to pass the whole suite.
    ///
    ///      What that gate protects: both registries hold `feeManager` as `immutable`, so a
    ///      FeeManager that starts quoting a hostile price cannot be swapped out without
    ///      redeploying the registries. `setFallbackPrice(1)` alone makes `baseFee * 1e18 / price`
    ///      enormous and prices every victim out of registering, with no delay and no warning.
    function test_FeeManager_SettersBlockedAfterSetup() public {
        FeeManager fm = _feeManager();
        fm.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        fm.setBaseFee(999_999);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        fm.setOperatorBatchFee(999_999);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        fm.setFallbackPrice(6000);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        fm.setStalePriceThreshold(7 days);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        fm.setPriceBounds(200_000, 400_000);

        assertEq(fm.baseFeeUsdCents(), 500, "base fee must be unchanged");
        assertEq(fm.fallbackEthPriceUsdCents(), 300_000, "fallback price must be unchanged");
        assertEq(fm.stalePriceThreshold(), 14_400, "staleness threshold must be unchanged");
        assertEq(fm.minEthPriceUsdCents(), 5000, "price bounds must be unchanged");
    }

    /// @notice Pointing at a NEW feed is timelocked; un-pointing to address(0) stays immediate.
    /// @dev `setPriceFeed` carries its gate inline rather than via `onlyDuringSetup`, so it is a
    ///      distinct code path from the setters above and needs its own assertion. The carve-out
    ///      follows the system-wide rule that revocations stay immediate: dropping to address(0)
    ///      disables the oracle and falls back to the manual price, which only ever NARROWS what
    ///      this contract trusts. It is the emergency response to a feed answering
    ///      wrongly-but-plausibly, and making it wait two days would be the wrong direction.
    function test_FeeManager_PriceFeedGrantTimelockedRevokeImmediate() public {
        FeeManager fm = _feeManager();
        fm.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        fm.setPriceFeed(makeAddr("hostileFeed"));

        // Un-pointing is still a one-transaction emergency action.
        fm.setPriceFeed(address(0));
        assertFalse(fm.useChainlink(), "revoking the oracle must not require the timelock");
    }

    /// @notice Each timelocked setter has a working propose → wait → activate path.
    /// @dev Without this, "blocked after setup" could be satisfied by a setter that is simply
    ///      dead post-setup, which would be a liveness bug rather than a fix.
    function test_FeeManager_SettersViaTimelock() public {
        FeeManager fm = _feeManager();
        fm.completeSetup();
        uint256 delay = fm.ACTIVATION_DELAY();

        fm.proposeBaseFee(1500);

        // Too early — the delay is real.
        vm.warp(block.timestamp + delay - 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        fm.activateBaseFee(1500);

        vm.warp(block.timestamp + 1);
        fm.activateBaseFee(1500);
        assertEq(fm.baseFeeUsdCents(), 1500);

        fm.proposeOperatorBatchFee(300);
        fm.proposeFallbackPrice(350_000);
        fm.proposeStalePriceThreshold(2 hours);
        fm.proposePriceBounds(100_000, 6_000_000);
        fm.proposePriceFeed(makeAddr("newFeed"));

        vm.warp(block.timestamp + delay);

        fm.activateOperatorBatchFee(300);
        fm.activateFallbackPrice(350_000);
        fm.activateStalePriceThreshold(2 hours);
        fm.activatePriceBounds(100_000, 6_000_000);
        fm.activatePriceFeed(makeAddr("newFeed"));

        assertEq(fm.operatorBatchFeeUsdCents(), 300);
        assertEq(fm.fallbackEthPriceUsdCents(), 350_000);
        assertEq(fm.stalePriceThreshold(), 2 hours);
        assertEq(fm.minEthPriceUsdCents(), 100_000);
        assertEq(fm.maxEthPriceUsdCents(), 6_000_000);
        assertEq(fm.priceFeed(), makeAddr("newFeed"));
    }

    /// @notice Activation applies only the exact values that were proposed.
    /// @dev The delay is worthless if activation arguments are unconstrained — an owner could
    ///      propose a benign fee, let the two days pass in public, then activate a different one.
    ///      Also pins that the action keys are per-setter: a `setBaseFee` proposal must not be
    ///      activatable as an `setOperatorBatchFee`, and a two-argument bounds proposal must match
    ///      on BOTH arguments.
    function test_FeeManager_ActivationRejectsUnproposedValues() public {
        FeeManager fm = _feeManager();
        fm.completeSetup();

        fm.proposeBaseFee(1500);
        fm.proposePriceBounds(100_000, 6_000_000);
        vm.warp(block.timestamp + fm.ACTIVATION_DELAY());

        // Same setter, different value.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        fm.activateBaseFee(9999);

        // A setBaseFee proposal is not a setOperatorBatchFee proposal, even at the same value.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        fm.activateOperatorBatchFee(1500);

        // Bounds must match on both arguments, not just the first.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        fm.activatePriceBounds(100_000, 7_000_000);

        fm.activateBaseFee(1500);
        assertEq(fm.baseFeeUsdCents(), 1500, "the proposed value still activates");
    }

    /// @notice The timelocked path re-runs the same validation as the immediate one.
    /// @dev Both paths funnel through the shared `_set*` internals, and this pins that they still
    ///      do. A `propose`/`activate` pair that wrote state directly would turn the timelock into
    ///      a validation bypass — the 2-day wait would buy an attacker an UNCHECKED write rather
    ///      than a checked one, which is strictly worse than no timelock at all.
    function test_FeeManager_TimelockedPathStillValidates() public {
        FeeManager fm = _feeManager();
        fm.completeSetup();
        uint256 delay = fm.ACTIVATION_DELAY();

        // Out-of-band fallback price: rejected by _setFallbackPrice, not by the timelock.
        fm.proposeFallbackPrice(1);
        // Bounds that would orphan the stored $3,000 fallback.
        fm.proposePriceBounds(500_000, 1_000_000);
        // Staleness threshold above the 7-day cap.
        fm.proposeStalePriceThreshold(30 days);

        vm.warp(block.timestamp + delay);

        vm.expectRevert(FeeManager.Fee__PriceOutOfBounds.selector);
        fm.activateFallbackPrice(1);

        vm.expectRevert(FeeManager.Fee__InvalidBounds.selector);
        fm.activatePriceBounds(500_000, 1_000_000);

        vm.expectRevert(FeeManager.Fee__InvalidThreshold.selector);
        fm.activateStalePriceThreshold(30 days);

        assertEq(fm.fallbackEthPriceUsdCents(), 300_000, "invalid activation must not write");
        assertEq(fm.minEthPriceUsdCents(), 5000, "invalid activation must not write");
        assertEq(fm.stalePriceThreshold(), 14_400, "invalid activation must not write");
    }

    /// @notice Proposals cannot be armed before completeSetup().
    /// @dev During setup the immediate setters are open, so a proposal buys nothing — its only
    ///      effect is to pre-arm an action that outlives setup and can be activated the moment the
    ///      contract goes live, with the community's reaction window already spent.
    function test_FeeManager_ProposeBlockedBeforeSetup() public {
        FeeManager fm = _feeManager();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupNotComplete.selector);
        fm.proposeBaseFee(1500);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupNotComplete.selector);
        fm.proposePriceBounds(100_000, 6_000_000);
    }

    /// @notice setFallbackSyncInterval is deliberately NOT timelocked.
    /// @dev Pins the documented exception so it is not "fixed" by someone pattern-matching the
    ///      other setters, and equally so that adding a timelock later is a conscious decision.
    ///      It is a gas-tuning knob: it cannot change a quoted fee, reject a payment, or repoint
    ///      any trust boundary. Its worst abuse costs one caller an extra SSTORE.
    function test_FeeManager_SyncIntervalStaysImmediateAfterSetup() public {
        FeeManager fm = _feeManager();
        fm.completeSetup();

        fm.setFallbackSyncInterval(12 hours);

        assertEq(fm.fallbackSyncInterval(), 12 hours);
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
