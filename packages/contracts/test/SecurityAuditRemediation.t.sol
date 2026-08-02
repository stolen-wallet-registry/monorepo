// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { OperatorSubmitter } from "../src/OperatorSubmitter.sol";
import { OperatorRegistry } from "../src/OperatorRegistry.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { TranslationRegistry } from "../src/soulbound/TranslationRegistry.sol";
import { CrossChainInbox } from "../src/CrossChainInbox.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { SoulboundReceiver } from "../src/soulbound/SoulboundReceiver.sol";
import { WalletSoulbound } from "../src/soulbound/WalletSoulbound.sol";
import { SupportSoulbound } from "../src/soulbound/SupportSoulbound.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { TimelockOwnable } from "../src/libraries/TimelockOwnable.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { IFeeManager } from "../src/interfaces/IFeeManager.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

/// @title SecurityAuditRemediationTest
/// @notice Tests for Almanax security audit findings remediation
contract SecurityAuditRemediationTest is Test {
    address public owner;

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01
        owner = address(this);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINDING 1B: OperatorSubmitter — ETH refunded when feeManager disabled
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice When feeManager is address(0), msg.value is fully refunded
    function test_OperatorSubmitter_RefundsETHWhenFeesDisabled() public {
        // Deploy with feeManager = address(0)
        WalletRegistry walletReg = new WalletRegistry(owner, address(0), 2, 50);
        TransactionRegistry txReg = new TransactionRegistry(owner, address(0), 2, 50);
        ContractRegistry contractReg = new ContractRegistry(owner);
        OperatorRegistry operatorReg = new OperatorRegistry(owner);

        OperatorSubmitter submitter = new OperatorSubmitter(
            owner,
            address(walletReg),
            address(txReg),
            address(contractReg),
            address(operatorReg),
            address(0), // feeManager disabled
            address(0) // feeRecipient irrelevant
        );

        // Wire registries
        walletReg.setOperatorSubmitter(address(submitter));

        // Approve operator
        address operator = makeAddr("operator");
        operatorReg.approveOperator(operator, operatorReg.ALL_REGISTRIES(), "TestOp");

        // Fund operator
        vm.deal(operator, 1 ether);
        uint256 balBefore = operator.balance;

        // Submit batch with ETH — should be fully refunded
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = bytes32(uint256(uint160(makeAddr("wallet1"))));
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = keccak256("eip155:1");
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp);

        vm.prank(operator);
        submitter.registerWalletsAsOperator{ value: 0.5 ether }(ids, chainIds, timestamps);

        // All ETH should be refunded (no fee taken)
        assertEq(operator.balance, balBefore, "ETH should be fully refunded when fees disabled");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINDING 3: TranslationRegistry — MAX_LANGUAGES, string limits, remove
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Cannot add more than MAX_LANGUAGES languages
    function test_TranslationRegistry_MaxLanguagesCap() public {
        TranslationRegistry tr = new TranslationRegistry(owner);
        // Constructor adds "en" as language 1. Add 49 more to fill to 50.
        for (uint256 i = 1; i < 50; i++) {
            string memory code = string(abi.encodePacked("l", vm.toString(i)));
            tr.addLanguage(code, "T", "S", "SS", "W", "F");
        }

        // 51st should revert
        vm.expectRevert(TranslationRegistry.MaxLanguagesReached.selector);
        tr.addLanguage("overflow", "T", "S", "SS", "W", "F");
    }

    /// @notice Strings exceeding MAX_STRING_LENGTH revert
    function test_TranslationRegistry_StringTooLong() public {
        TranslationRegistry tr = new TranslationRegistry(owner);

        // Build a string that's 257 bytes (1 over limit)
        bytes memory longBytes = new bytes(257);
        for (uint256 i = 0; i < 257; i++) {
            longBytes[i] = "a";
        }
        string memory longString = string(longBytes);

        // addLanguage: title too long
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.StringTooLong.selector, "title"));
        tr.addLanguage("xx", longString, "S", "SS", "W", "F");

        // addLanguage: subtitle too long
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.StringTooLong.selector, "subtitle"));
        tr.addLanguage("xx", "T", longString, "SS", "W", "F");

        // updateLanguage: warning too long
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.StringTooLong.selector, "warning"));
        tr.updateLanguage("en", "T", "S", "SS", longString, "F");
    }

    /// @notice 256-byte strings are accepted (boundary)
    function test_TranslationRegistry_StringExactlyMaxLength() public {
        TranslationRegistry tr = new TranslationRegistry(owner);

        bytes memory exactBytes = new bytes(256);
        for (uint256 i = 0; i < 256; i++) {
            exactBytes[i] = "b";
        }
        string memory exactString = string(exactBytes);

        // Should NOT revert
        tr.addLanguage("xx", exactString, "S", "SS", "W", "F");
    }

    /// @notice removeLanguage works and emits event
    function test_TranslationRegistry_RemoveLanguage() public {
        TranslationRegistry tr = new TranslationRegistry(owner);
        tr.addLanguage("es", "T", "S", "SS", "W", "F");

        assertTrue(tr.isLanguageSupported("es"), "es should exist before removal");

        tr.removeLanguage("es");

        assertFalse(tr.isLanguageSupported("es"), "es should not exist after removal");

        // Array should only contain "en" now
        string[] memory langs = tr.getSupportedLanguages();
        assertEq(langs.length, 1);
    }

    /// @notice removeLanguage reverts for non-existent language
    function test_TranslationRegistry_RemoveLanguage_NotFound() public {
        TranslationRegistry tr = new TranslationRegistry(owner);
        vm.expectRevert(abi.encodeWithSelector(TranslationRegistry.LanguageNotFound.selector, "zz"));
        tr.removeLanguage("zz");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINDING 2: CrossChainInbox — canonical messageId (trailing bytes)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet messages with trailing bytes are rejected (exact length check)
    function test_CrossChainInbox_WalletMessageRejectsTrailingBytes() public {
        CrossChainMessage.WalletRegistrationPayload memory wp = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: bytes32(0),
            identifier: bytes32(uint256(1)),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(1)),
            incidentTimestamp: uint64(block.timestamp),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(31_338)),
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: keccak256("test")
        });
        bytes memory encoded = CrossChainMessage.encodeWalletRegistration(wp);

        // Append trailing byte
        bytes memory withTrailing = abi.encodePacked(encoded, bytes1(0xFF));

        // Should revert with InvalidMessageLength since length != 384
        CrossChainMessageCallerHelper caller = new CrossChainMessageCallerHelper();
        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector);
        caller.decodeWallet(withTrailing);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINDING 6: SoulboundReceiver — non-canonical bytes32 sender
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Non-canonical bytes32 sender (upper bits set) reverts
    function test_SoulboundReceiver_NonCanonicalSenderReverts() public {
        address mockMailbox = makeAddr("mailbox");
        WalletRegistry walletReg = new WalletRegistry(owner, address(0), 2, 50);
        TranslationRegistry tr = new TranslationRegistry(owner);
        WalletSoulbound ws = new WalletSoulbound(address(walletReg), address(tr), owner, "test.xyz", owner);
        SupportSoulbound ss = new SupportSoulbound(0.0001 ether, address(tr), owner, "test.xyz", owner);
        SoulboundReceiver receiver = new SoulboundReceiver(owner, mockMailbox, address(ws), address(ss));

        // Set trusted forwarder
        address forwarder = makeAddr("forwarder");
        receiver.setTrustedForwarder(31_338, forwarder);

        // Build non-canonical sender: correct address in lower 20 bytes, but upper 12 bytes dirty
        bytes32 nonCanonicalSender = bytes32(uint256(uint160(forwarder)) | (uint256(0xFF) << 160));

        // Should revert
        bytes memory message = abi.encode(uint8(1), makeAddr("wallet"), address(0), uint256(0));
        vm.prank(mockMailbox);
        vm.expectRevert(abi.encodeWithSignature("SoulboundReceiver__NonCanonicalSender()"));
        receiver.handle(31_338, nonCanonicalSender, message);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINDING 7: TimelockOwnable — propose/activate/cancel cycle
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Activate before delay reverts with TooEarly
    function test_Timelock_ActivateBeforeDelayReverts() public {
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        hub.setWalletRegistry(makeAddr("walletReg1"));
        hub.completeSetup();

        // Propose change
        address newWalletReg = makeAddr("walletReg2");
        hub.proposeWalletRegistry(newWalletReg);

        // Try to activate immediately — should revert
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        hub.activateWalletRegistry(newWalletReg);
    }

    /// @notice Propose → wait → activate succeeds
    function test_Timelock_ProposeWaitActivateSucceeds() public {
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        hub.setWalletRegistry(makeAddr("walletReg1"));
        hub.completeSetup();

        address newWalletReg = makeAddr("walletReg2");
        hub.proposeWalletRegistry(newWalletReg);

        // Warp past the 2-day delay
        vm.warp(block.timestamp + 2 days + 1);

        hub.activateWalletRegistry(newWalletReg);
        assertEq(hub.walletRegistry(), newWalletReg, "WalletRegistry should be updated");
    }

    /// @notice Cancel removes the proposal
    function test_Timelock_CancelWorks() public {
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        hub.setWalletRegistry(makeAddr("walletReg1"));
        hub.completeSetup();

        address newWalletReg = makeAddr("walletReg2");
        hub.proposeWalletRegistry(newWalletReg);

        // Cancel the proposal
        bytes32 actionKey = keccak256(abi.encode("setWalletRegistry", newWalletReg));
        hub.cancelAction(actionKey);

        // Warp and try to activate — should revert (was cancelled)
        vm.warp(block.timestamp + 2 days + 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        hub.activateWalletRegistry(newWalletReg);
    }

    /// @notice Immediate setters revert after completeSetup()
    function test_Timelock_ImmediateSettersLockedAfterSetup() public {
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        hub.setWalletRegistry(makeAddr("walletReg1"));
        hub.completeSetup();

        // Should revert with SetupAlreadyComplete
        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        hub.setWalletRegistry(makeAddr("walletReg2"));
    }

    /// @notice completeSetup() is irreversible
    function test_Timelock_CompleteSetupIsIrreversible() public {
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        hub.completeSetup();

        // Literal double-completeSetup keeps SetupAlreadyComplete — it is the one case where the
        // name is accurate, and there is no timelocked path to point the caller at.
        vm.expectRevert(TimelockOwnable.TimelockOwnable__SetupAlreadyComplete.selector);
        hub.completeSetup();
    }

    /// @notice Duplicate proposal reverts
    function test_Timelock_DuplicateProposalReverts() public {
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        hub.setWalletRegistry(makeAddr("wr1"));
        hub.completeSetup();

        address newReg = makeAddr("wr2");
        hub.proposeWalletRegistry(newReg);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__AlreadyPending.selector);
        hub.proposeWalletRegistry(newReg);
    }

    /// @notice OperatorRegistry timelock: proposeOperator → activateOperator
    function test_Timelock_OperatorRegistry_ProposeActivate() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        reg.completeSetup();

        address op = makeAddr("newOp");
        uint8 allRegs = reg.ALL_REGISTRIES(); // pre-compute to avoid vm.expectRevert catching the getter
        reg.proposeOperator(op, allRegs, "NewOp");

        // Activate before delay fails
        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        reg.activateOperator(op, allRegs, "NewOp");

        // After delay succeeds
        vm.warp(block.timestamp + 2 days + 1);
        reg.activateOperator(op, allRegs, "NewOp");
        assertTrue(reg.isApproved(op));
    }

    /// @notice OperatorRegistry: revokeOperator stays immediate (no timelock)
    function test_Timelock_OperatorRevoke_StaysImmediate() public {
        OperatorRegistry reg = new OperatorRegistry(owner);
        address op = makeAddr("revokeOp");
        reg.approveOperator(op, reg.ALL_REGISTRIES(), "RevokeOp");
        reg.completeSetup();

        // Revoke should work immediately even after setup
        reg.revokeOperator(op);
        assertFalse(reg.isApproved(op));
    }

    /// @notice CrossChainInbox timelock: GRANTING trust is locked after setup, revoking is not
    /// @dev The setter used to be `onlyDuringSetup` unconditionally, which also blocked the
    ///      revoke direction — so cutting off a spoke that was forging registrations took 2 days.
    ///      Matches HyperlaneAdapter: grants widen the trust boundary and are timelocked;
    ///      revocations only narrow it and are the emergency response.
    function test_Timelock_CrossChainInbox_SetTrustedSourceLockedAfterSetup() public {
        MockMailbox mailbox = new MockMailbox(84_532);
        FraudRegistryHub hub = new FraudRegistryHub(owner, owner);
        CrossChainInbox inbox = new CrossChainInbox(address(mailbox), address(hub), owner);

        bytes32 spokeBytes = bytes32(uint256(uint160(makeAddr("spoke"))));
        inbox.setTrustedSource(31_338, spokeBytes, true);
        inbox.completeSetup();

        // Granting trust in one transaction is locked
        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        inbox.setTrustedSource(31_339, spokeBytes, true);

        // Revoking is immediate
        inbox.setTrustedSource(31_338, spokeBytes, false);
        assertFalse(inbox.isTrustedSource(31_338, spokeBytes));

        // And the grant still works through propose/activate
        inbox.proposeTrustedSource(31_338, spokeBytes, true);
        vm.warp(block.timestamp + 2 days + 1);
        inbox.activateTrustedSource(31_338, spokeBytes, true);
        assertTrue(inbox.isTrustedSource(31_338, spokeBytes));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FOLLOW-UP: registries and OperatorSubmitter moved onto TimelockOwnable
    // ═══════════════════════════════════════════════════════════════════════════
    //
    // setHub / setOperatorSubmitter / setOperatorRegistry are the same class of
    // trust-boundary change the hub and inbox already protect: whoever holds those
    // addresses can write registry entries directly, with no signature and no fee. They
    // used to be one-transaction owner setters with no delay and no removal mechanism,
    // so a compromised owner key could swap the operatorSubmitter and immediately
    // register arbitrary identifiers. These tests pin the timelock in place.

    /// @notice WalletRegistry.setHub is locked after completeSetup and only movable via timelock
    function test_Timelock_WalletRegistry_SetHubLockedAfterSetup() public {
        WalletRegistry reg = new WalletRegistry(owner, address(0), 2, 50);
        reg.setHub(makeAddr("hub1"));
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.setHub(makeAddr("hub2"));

        address newHub = makeAddr("hub2");
        reg.proposeHub(newHub);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        reg.activateHub(newHub);

        vm.warp(block.timestamp + 2 days + 1);
        reg.activateHub(newHub);
        assertEq(reg.hub(), newHub, "hub should be updated after the delay");
    }

    /// @notice WalletRegistry.setOperatorSubmitter follows the same propose/activate path
    function test_Timelock_WalletRegistry_OperatorSubmitter() public {
        WalletRegistry reg = new WalletRegistry(owner, address(0), 2, 50);
        reg.setOperatorSubmitter(makeAddr("submitter1"));
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.setOperatorSubmitter(makeAddr("submitter2"));

        address newSubmitter = makeAddr("submitter2");
        reg.proposeOperatorSubmitter(newSubmitter);
        vm.warp(block.timestamp + 2 days + 1);
        reg.activateOperatorSubmitter(newSubmitter);
        assertEq(reg.operatorSubmitter(), newSubmitter);
    }

    /// @notice TransactionRegistry gets the same protection
    function test_Timelock_TransactionRegistry_SetHubLockedAfterSetup() public {
        TransactionRegistry reg = new TransactionRegistry(owner, address(0), 2, 50);
        reg.setHub(makeAddr("hub1"));
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.setHub(makeAddr("hub2"));

        address newHub = makeAddr("hub2");
        reg.proposeHub(newHub);
        vm.warp(block.timestamp + 2 days + 1);
        reg.activateHub(newHub);
        assertEq(reg.hub(), newHub);
    }

    /// @notice ContractRegistry's operatorSubmitter is the only write path into it, so it
    ///         is the most sensitive of the three — operator-only registry, no user signatures.
    function test_Timelock_ContractRegistry_OperatorSubmitterLockedAfterSetup() public {
        ContractRegistry reg = new ContractRegistry(owner);
        reg.setOperatorSubmitter(makeAddr("submitter1"));
        reg.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        reg.setOperatorSubmitter(makeAddr("submitter2"));

        address newSubmitter = makeAddr("submitter2");
        reg.proposeOperatorSubmitter(newSubmitter);

        vm.expectRevert(TimelockOwnable.TimelockOwnable__TooEarly.selector);
        reg.activateOperatorSubmitter(newSubmitter);

        vm.warp(block.timestamp + 2 days + 1);
        reg.activateOperatorSubmitter(newSubmitter);
        assertEq(reg.operatorSubmitter(), newSubmitter);
    }

    /// @notice OperatorSubmitter.setOperatorRegistry decides who may submit batches at all
    function test_Timelock_OperatorSubmitter_SetOperatorRegistryLockedAfterSetup() public {
        WalletRegistry walletReg = new WalletRegistry(owner, address(0), 2, 50);
        TransactionRegistry txReg = new TransactionRegistry(owner, address(0), 2, 50);
        ContractRegistry contractReg = new ContractRegistry(owner);
        OperatorRegistry operatorReg = new OperatorRegistry(owner);

        OperatorSubmitter submitter = new OperatorSubmitter(
            owner,
            address(walletReg),
            address(txReg),
            address(contractReg),
            address(operatorReg),
            address(0),
            address(0)
        );

        submitter.completeSetup();

        vm.expectRevert(TimelockOwnable.TimelockOwnable__UseTimelockedPath.selector);
        submitter.setOperatorRegistry(makeAddr("registry2"));

        address newRegistry = makeAddr("registry2");
        submitter.proposeOperatorRegistry(newRegistry);
        vm.warp(block.timestamp + 2 days + 1);
        submitter.activateOperatorRegistry(newRegistry);
        assertEq(submitter.operatorRegistry(), newRegistry);
    }

    /// @notice A cancelled proposal cannot later be activated on the registries either
    function test_Timelock_WalletRegistry_CancelBlocksActivation() public {
        WalletRegistry reg = new WalletRegistry(owner, address(0), 2, 50);
        reg.completeSetup();

        address newHub = makeAddr("hub2");
        reg.proposeHub(newHub);
        reg.cancelAction(keccak256(abi.encode("setHub", newHub)));

        vm.warp(block.timestamp + 2 days + 1);
        vm.expectRevert(TimelockOwnable.TimelockOwnable__NotProposed.selector);
        reg.activateHub(newHub);
    }
}

/// @dev Helper to test calldata-taking library functions from memory
contract CrossChainMessageCallerHelper {
    function decodeWallet(bytes calldata data)
        external
        pure
        returns (CrossChainMessage.WalletRegistrationPayload memory)
    {
        return CrossChainMessage.decodeWalletRegistration(data);
    }
}
