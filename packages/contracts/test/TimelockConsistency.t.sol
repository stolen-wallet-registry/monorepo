// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
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

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
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

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
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

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
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

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
        submitter.setWalletRegistry(sink);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
        submitter.setTransactionRegistry(sink);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
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

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
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

        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
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
}
