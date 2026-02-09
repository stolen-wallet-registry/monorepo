// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { IFraudRegistryHub } from "../src/interfaces/IFraudRegistryHub.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { IWalletRegistry } from "../src/interfaces/IWalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ITransactionRegistry } from "../src/interfaces/ITransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { IContractRegistry } from "../src/interfaces/IContractRegistry.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";

/// @title FraudRegistryHubTest
/// @notice Tests for FraudRegistryHub: cross-chain routing, unified query, fee management, admin
contract FraudRegistryHubTest is Test {
    using Strings for uint256;

    FraudRegistryHub public hub;
    WalletRegistry public walletRegistry;
    TransactionRegistry public txRegistry;
    ContractRegistry public contractRegistry;

    address public owner;
    address public feeRecipient;
    address public inbox;
    address public operatorSubmitter;

    bytes32 public operatorId = keccak256("testOperator");

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;
    uint64 internal constant CHAIN_ID = 8453; // Base

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01

        owner = address(this);
        feeRecipient = makeAddr("feeRecipient");
        inbox = makeAddr("inbox");
        operatorSubmitter = makeAddr("operatorSubmitter");

        // Deploy registries
        walletRegistry = new WalletRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        txRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        contractRegistry = new ContractRegistry(owner);

        // Deploy hub
        hub = new FraudRegistryHub(owner, feeRecipient);

        // Wire up hub -> registries
        hub.setWalletRegistry(address(walletRegistry));
        hub.setTransactionRegistry(address(txRegistry));
        hub.setContractRegistry(address(contractRegistry));

        // Wire up registries -> hub
        walletRegistry.setHub(address(hub));
        txRegistry.setHub(address(hub));

        // Set inbox on hub
        hub.setInbox(inbox);

        // Set operator submitter on registries for pre-registering test data
        walletRegistry.setOperatorSubmitter(operatorSubmitter);
        txRegistry.setOperatorSubmitter(operatorSubmitter);
        contractRegistry.setOperatorSubmitter(operatorSubmitter);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _addressToLowerHex(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        uint160 value = uint160(addr);
        for (uint256 i = 41; i > 1; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }

    function _buildCaip10(address addr, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", _addressToLowerHex(addr)));
    }

    function _bytes32ToHexString(bytes32 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(66);
        buffer[0] = "0";
        buffer[1] = "x";
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            buffer[2 + i * 2] = alphabet[uint8(value[i]) >> 4];
            buffer[3 + i * 2] = alphabet[uint8(value[i]) & 0x0f];
        }
        return string(buffer);
    }

    function _buildTxRef(bytes32 txHash, uint64 chainId) internal pure returns (string memory) {
        return string(abi.encodePacked("eip155:", uint256(chainId).toString(), ":", _bytes32ToHexString(txHash)));
    }

    /// @dev Register a wallet via operator path for lookup tests
    function _registerWalletViaOperator(address wallet) internal {
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = bytes32(uint256(uint160(wallet)));
        bytes32[] memory reportedChainIds = new bytes32[](1);
        reportedChainIds[0] = CAIP10Evm.caip2Hash(CHAIN_ID);
        uint64[] memory timestamps = new uint64[](1);
        timestamps[0] = uint64(block.timestamp - 1 days);

        vm.prank(operatorSubmitter);
        walletRegistry.registerWalletsFromOperator(operatorId, identifiers, reportedChainIds, timestamps);
    }

    /// @dev Register a transaction via operator path for lookup tests
    function _registerTxViaOperator(bytes32 txHash) internal {
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(CHAIN_ID);

        vm.prank(operatorSubmitter);
        txRegistry.registerTransactionsFromOperator(operatorId, hashes, chainIds);
    }

    /// @dev Register a contract via operator path for lookup tests
    function _registerContractViaOperator(address contractAddr) internal {
        bytes32[] memory identifiers = new bytes32[](1);
        identifiers[0] = bytes32(uint256(uint160(contractAddr)));
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(CHAIN_ID);

        vm.prank(operatorSubmitter);
        contractRegistry.registerContractsFromOperator(operatorId, identifiers, chainIds);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor rejects zero owner address
    function test_Constructor_RejectsZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new FraudRegistryHub(address(0), feeRecipient);
    }

    /// @notice Constructor rejects zero fee recipient
    function test_Constructor_RejectsZeroFeeRecipient() public {
        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        new FraudRegistryHub(owner, address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN ROUTING — registerWalletFromSpoke
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Inbox can register a wallet from spoke, wallet stored in WalletRegistry
    function test_RegisterWalletFromSpoke_Success() public {
        address wallet = makeAddr("spokeWallet");
        bytes32 identifier = bytes32(uint256(uint160(wallet)));
        bytes32 namespaceHash = keccak256("eip155");
        bytes32 chainRefHash = bytes32(0);
        bytes32 reportedChainId = CAIP10Evm.caip2Hash(uint64(11_155_420));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        bytes32 sourceChainId = CAIP10Evm.caip2Hash(uint64(11_155_420));
        bytes32 messageId = keccak256("testMsg");

        vm.expectEmit(true, true, false, true);
        emit IWalletRegistry.WalletRegistered(identifier, reportedChainId, incidentTimestamp, false);

        vm.expectEmit(true, true, false, true);
        emit IWalletRegistry.CrossChainWalletRegistered(identifier, sourceChainId, 1, messageId);

        vm.prank(inbox);
        hub.registerWalletFromSpoke(
            namespaceHash,
            chainRefHash,
            identifier,
            reportedChainId,
            incidentTimestamp,
            sourceChainId,
            false,
            1,
            messageId
        );

        // Verify stored via typed lookup
        assertTrue(walletRegistry.isWalletRegistered(wallet), "Wallet should be registered");
    }

    /// @notice Non-inbox caller gets OnlyInbox revert
    function test_RegisterWalletFromSpoke_RejectsNonInbox() public {
        address randomCaller = makeAddr("random");

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__OnlyInbox.selector);
        vm.prank(randomCaller);
        hub.registerWalletFromSpoke(
            keccak256("eip155"), bytes32(0), bytes32(uint256(1)), bytes32(0), 0, bytes32(0), false, 1, bytes32(0)
        );
    }

    /// @notice Paused hub rejects cross-chain wallet registration
    function test_RegisterWalletFromSpoke_RejectsWhenPaused() public {
        hub.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(inbox);
        hub.registerWalletFromSpoke(
            keccak256("eip155"), bytes32(0), bytes32(uint256(1)), bytes32(0), 0, bytes32(0), false, 1, bytes32(0)
        );
    }

    /// @notice Reverts when walletRegistry is not set
    function test_RegisterWalletFromSpoke_RejectsWhenRegistryNotSet() public {
        // Deploy a hub without wallet registry configured
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);
        freshHub.setInbox(inbox);

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        vm.prank(inbox);
        freshHub.registerWalletFromSpoke(
            keccak256("eip155"), bytes32(0), bytes32(uint256(1)), bytes32(0), 0, bytes32(0), false, 1, bytes32(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN ROUTING — registerTransactionsFromSpoke
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Inbox can register transactions from spoke, txs stored in TransactionRegistry
    function test_RegisterTransactionsFromSpoke_Success() public {
        address reporter = makeAddr("reporter");
        bytes32 txHash = keccak256("fraudTx");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);
        bytes32 reportedChainId = chainId;
        bytes32 sourceChainId = CAIP10Evm.caip2Hash(uint64(11_155_420));
        bytes32 messageId = keccak256("txMsg");

        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        bytes32 dataHash = keccak256(abi.encode(txHashes, chainIds));

        vm.prank(inbox);
        hub.registerTransactionsFromSpoke(
            reporter, dataHash, reportedChainId, sourceChainId, false, txHashes, chainIds, 1, messageId
        );

        // Verify stored
        assertTrue(txRegistry.isTransactionRegistered(txHash, chainId), "Transaction should be registered");
    }

    /// @notice Non-inbox caller gets OnlyInbox revert for transaction registration
    function test_RegisterTransactionsFromSpoke_RejectsNonInbox() public {
        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = keccak256("tx");
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(CHAIN_ID);

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__OnlyInbox.selector);
        vm.prank(makeAddr("random"));
        hub.registerTransactionsFromSpoke(
            makeAddr("reporter"), keccak256("data"), bytes32(0), bytes32(0), false, txHashes, chainIds, 1, bytes32(0)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED QUERY — isRegistered with CAIP-10 string
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isRegistered finds a wallet registered via operator path
    function test_IsRegistered_FindsWallet() public {
        address wallet = makeAddr("queryWallet");
        _registerWalletViaOperator(wallet);

        // Query with CAIP-10 string (42-char address identifier)
        string memory caip10 = _buildCaip10(wallet, CHAIN_ID);
        assertTrue(hub.isRegistered(caip10), "Hub should find wallet via CAIP-10 string");
    }

    /// @notice isRegistered finds a transaction registered via operator path
    function test_IsRegistered_FindsTransaction() public {
        bytes32 txHash = keccak256("queryTx");
        _registerTxViaOperator(txHash);

        // Query with chain-qualified reference (66-char tx hash identifier)
        string memory ref = _buildTxRef(txHash, CHAIN_ID);
        assertTrue(hub.isRegistered(ref), "Hub should find transaction via chain-qualified reference");
    }

    /// @notice isRegistered finds a contract registered via operator path
    function test_IsRegistered_FindsContract() public {
        address malicious = makeAddr("queryContract");
        _registerContractViaOperator(malicious);

        // Query with CAIP-10 string (42-char address identifier)
        string memory caip10 = _buildCaip10(malicious, CHAIN_ID);
        assertTrue(hub.isRegistered(caip10), "Hub should find contract via CAIP-10 string");
    }

    /// @notice isRegistered returns false for unknown identifiers
    function test_IsRegistered_ReturnsFalseForUnknown() public {
        address unknown = makeAddr("unknown");
        string memory caip10 = _buildCaip10(unknown, CHAIN_ID);
        assertFalse(hub.isRegistered(caip10), "Hub should return false for unregistered identifier");
    }

    /// @notice isRegistered reverts for non-canonical tx refs (missing 0x prefix, 64 hex chars)
    function test_IsRegistered_RevertsForTxRefMissing0x() public {
        // 64 hex chars, no 0x prefix
        string memory no0x = string(
            abi.encodePacked(
                "eip155:",
                uint256(CHAIN_ID).toString(),
                ":",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            )
        );

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__InvalidIdentifierLength.selector);
        hub.isRegistered(no0x);
    }

    /// @notice getRegisteredTypes reverts for non-canonical tx refs (missing 0x prefix)
    function test_GetRegisteredTypes_RevertsForTxRefMissing0x() public {
        string memory no0x = string(
            abi.encodePacked(
                "eip155:",
                uint256(CHAIN_ID).toString(),
                ":",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            )
        );

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__InvalidIdentifierLength.selector);
        hub.getRegisteredTypes(no0x);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASSTHROUGH VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isWalletRegistered passthrough works via typed interface
    function test_IsWalletRegistered_Passthrough() public {
        address wallet = makeAddr("passthroughWallet");
        _registerWalletViaOperator(wallet);

        assertTrue(hub.isWalletRegistered(wallet), "Hub passthrough should find wallet");
    }

    /// @notice getWalletEntry returns empty struct when wallet registry is not set
    function test_GetWalletEntry_ReturnsEmptyWhenNoRegistry() public {
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        IWalletRegistry.WalletEntry memory entry = freshHub.getWalletEntry(makeAddr("any"));
        assertEq(entry.registeredAt, 0, "registeredAt should be 0");
        assertEq(entry.reportedChainId, bytes32(0), "reportedChainId should be zero");
        assertEq(entry.incidentTimestamp, 0, "incidentTimestamp should be 0");
        assertFalse(entry.isSponsored, "isSponsored should be false");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can withdraw accumulated fees
    function test_WithdrawFees_Success() public {
        // Send ETH to hub simulating fee accumulation
        vm.deal(address(hub), 1 ether);

        uint256 recipientBefore = feeRecipient.balance;

        vm.expectEmit(true, false, false, true);
        emit IFraudRegistryHub.FeesWithdrawn(feeRecipient, 1 ether);

        hub.withdrawFees();

        assertEq(feeRecipient.balance, recipientBefore + 1 ether, "Fee recipient should receive fees");
        assertEq(address(hub).balance, 0, "Hub should have zero balance after withdrawal");
    }

    /// @notice Non-owner cannot withdraw fees
    function test_WithdrawFees_OnlyOwner() public {
        vm.deal(address(hub), 1 ether);
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        hub.withdrawFees();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setWalletRegistry emits RegistryUpdated event
    function test_SetWalletRegistry_Success() public {
        address newWalletRegistry = makeAddr("newWalletReg");

        vm.expectEmit(true, false, false, true);
        emit IFraudRegistryHub.RegistryUpdated(
            IFraudRegistryHub.RegistryType.WALLET, address(walletRegistry), newWalletRegistry
        );

        hub.setWalletRegistry(newWalletRegistry);
        assertEq(hub.walletRegistry(), newWalletRegistry);
    }

    /// @notice setInbox emits InboxUpdated event
    function test_SetInbox_Success() public {
        address newInbox = makeAddr("newInbox");

        vm.expectEmit(false, false, false, true);
        emit IFraudRegistryHub.InboxUpdated(inbox, newInbox);

        hub.setInbox(newInbox);
        assertEq(hub.inbox(), newInbox);
    }

    /// @notice setFeeRecipient emits FeeRecipientUpdated event
    function test_SetFeeRecipient_Success() public {
        address newRecipient = makeAddr("newRecipient");

        vm.expectEmit(false, false, false, true);
        emit IFraudRegistryHub.FeeRecipientUpdated(feeRecipient, newRecipient);

        hub.setFeeRecipient(newRecipient);
        assertEq(hub.feeRecipient(), newRecipient);
    }

    /// @notice Owner can pause and unpause cross-chain registrations
    function test_Pause_Unpause() public {
        hub.pause();

        // Cross-chain registration should revert when paused
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(inbox);
        hub.registerWalletFromSpoke(
            keccak256("eip155"), bytes32(0), bytes32(uint256(1)), bytes32(0), 0, bytes32(0), false, 1, bytes32(0)
        );

        hub.unpause();

        // After unpause, registration should proceed (may revert for other reasons, but not pause)
        // Just confirm it no longer reverts with EnforcedPause
        // The call may revert with AlreadyRegistered or succeed — either proves unpause worked
        vm.prank(inbox);
        hub.registerWalletFromSpoke(
            keccak256("eip155"),
            bytes32(0),
            bytes32(uint256(1)),
            CAIP10Evm.caip2Hash(CHAIN_ID),
            0,
            CAIP10Evm.caip2Hash(CHAIN_ID),
            false,
            1,
            keccak256("unpauseTest")
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN SETTERS — setTransactionRegistry
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setTransactionRegistry emits RegistryUpdated with TRANSACTION type and updates state
    function test_SetTransactionRegistry_Success() public {
        address newTxReg = makeAddr("newTxReg");

        // Reset to fresh hub to verify old address in event
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        vm.expectEmit(true, false, false, true);
        emit IFraudRegistryHub.RegistryUpdated(IFraudRegistryHub.RegistryType.TRANSACTION, address(0), newTxReg);

        freshHub.setTransactionRegistry(newTxReg);
        assertEq(freshHub.transactionRegistry(), newTxReg, "transactionRegistry should be updated");
    }

    /// @notice setTransactionRegistry rejects zero address
    function test_SetTransactionRegistry_RejectsZeroAddress() public {
        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        hub.setTransactionRegistry(address(0));
    }

    /// @notice setTransactionRegistry rejects non-owner caller
    function test_SetTransactionRegistry_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        hub.setTransactionRegistry(makeAddr("newTxReg"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN SETTERS — setContractRegistry
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setContractRegistry emits RegistryUpdated with CONTRACT type and updates state
    function test_SetContractRegistry_Success() public {
        address newContractReg = makeAddr("newContractReg");

        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        vm.expectEmit(true, false, false, true);
        emit IFraudRegistryHub.RegistryUpdated(IFraudRegistryHub.RegistryType.CONTRACT, address(0), newContractReg);

        freshHub.setContractRegistry(newContractReg);
        assertEq(freshHub.contractRegistry(), newContractReg, "contractRegistry should be updated");
    }

    /// @notice setContractRegistry rejects zero address
    function test_SetContractRegistry_RejectsZeroAddress() public {
        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        hub.setContractRegistry(address(0));
    }

    /// @notice setContractRegistry rejects non-owner caller
    function test_SetContractRegistry_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        hub.setContractRegistry(makeAddr("newContractReg"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN SETTERS — zero-address rejections for remaining setters
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice setWalletRegistry rejects zero address
    function test_SetWalletRegistry_RejectsZeroAddress() public {
        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        hub.setWalletRegistry(address(0));
    }

    /// @notice setInbox rejects zero address
    function test_SetInbox_RejectsZeroAddress() public {
        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        hub.setInbox(address(0));
    }

    /// @notice setFeeRecipient rejects zero address
    function test_SetFeeRecipient_RejectsZeroAddress() public {
        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        hub.setFeeRecipient(address(0));
    }

    /// @notice setInbox rejects non-owner caller
    function test_SetInbox_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        hub.setInbox(makeAddr("newInbox"));
    }

    /// @notice setFeeRecipient rejects non-owner caller
    function test_SetFeeRecipient_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        hub.setFeeRecipient(makeAddr("newRecipient"));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TYPED PASSTHROUGH VIEWS — isTransactionRegistered / isContractRegistered
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice isTransactionRegistered typed passthrough returns true for registered tx
    function test_IsTransactionRegistered_Typed() public {
        bytes32 txHash = keccak256("typedTx");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);
        _registerTxViaOperator(txHash);

        assertTrue(hub.isTransactionRegistered(txHash, chainId), "Hub should find transaction via typed passthrough");
    }

    /// @notice isContractRegistered typed passthrough returns true for registered contract
    function test_IsContractRegistered_Typed() public {
        address malicious = makeAddr("typedContract");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);
        _registerContractViaOperator(malicious);

        assertTrue(hub.isContractRegistered(malicious, chainId), "Hub should find contract via typed passthrough");
    }

    /// @notice isTransactionRegistered returns false when txRegistry is not set
    function test_IsTransactionRegistered_ReturnsFalseWhenRegistryNotSet() public {
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        bytes32 txHash = keccak256("anyTx");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        assertFalse(freshHub.isTransactionRegistered(txHash, chainId), "Should return false with no txRegistry");
    }

    /// @notice isContractRegistered returns false when contractRegistry is not set
    function test_IsContractRegistered_ReturnsFalseWhenRegistryNotSet() public {
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        address anyContract = makeAddr("anyContract");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        assertFalse(freshHub.isContractRegistered(anyContract, chainId), "Should return false with no contractRegistry");
    }

    /// @notice getTransactionEntry returns empty struct when txRegistry is not set
    function test_GetTransactionEntry_ReturnsEmptyWhenNoRegistry() public {
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        bytes32 txHash = keccak256("anyTx");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        ITransactionRegistry.TransactionEntry memory entry = freshHub.getTransactionEntry(txHash, chainId);
        assertEq(entry.registeredAt, 0, "registeredAt should be 0");
        assertEq(entry.reportedChainId, bytes32(0), "reportedChainId should be zero");
        assertEq(entry.reporter, address(0), "reporter should be zero address");
        assertFalse(entry.isSponsored, "isSponsored should be false");
    }

    /// @notice getContractEntry returns empty struct when contractRegistry is not set
    function test_GetContractEntry_ReturnsEmptyWhenNoRegistry() public {
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);

        address anyContract = makeAddr("anyContract");
        bytes32 chainId = CAIP10Evm.caip2Hash(CHAIN_ID);

        IContractRegistry.ContractEntry memory entry = freshHub.getContractEntry(anyContract, chainId);
        assertEq(entry.registeredAt, 0, "registeredAt should be 0");
        assertEq(entry.reportedChainId, bytes32(0), "reportedChainId should be zero");
        assertEq(entry.operatorId, bytes32(0), "operatorId should be zero");
        assertEq(entry.batchId, 0, "batchId should be 0");
    }

    /// @notice getWalletEntry returns actual data after wallet is registered
    function test_GetWalletEntry_ReturnsDataWhenRegistered() public {
        address wallet = makeAddr("entryWallet");
        _registerWalletViaOperator(wallet);

        IWalletRegistry.WalletEntry memory entry = hub.getWalletEntry(wallet);
        assertGt(entry.registeredAt, 0, "registeredAt should be non-zero");
        assertEq(entry.reportedChainId, CAIP10Evm.caip2Hash(CHAIN_ID), "reportedChainId should match");
        // incidentTimestamp was set to block.timestamp - 1 days in _registerWalletViaOperator
        assertEq(entry.incidentTimestamp, uint64(block.timestamp - 1 days), "incidentTimestamp should match");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GET REGISTERED TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice getRegisteredTypes returns [WALLET] for a wallet-only registration
    function test_GetRegisteredTypes_Wallet() public {
        address wallet = makeAddr("typesWallet");
        _registerWalletViaOperator(wallet);

        string memory caip10 = _buildCaip10(wallet, CHAIN_ID);
        IFraudRegistryHub.RegistryType[] memory types = hub.getRegisteredTypes(caip10);

        assertEq(types.length, 1, "Should have exactly 1 type");
        assertTrue(types[0] == IFraudRegistryHub.RegistryType.WALLET, "Type should be WALLET");
    }

    /// @notice getRegisteredTypes returns [TRANSACTION] for a registered tx hash
    function test_GetRegisteredTypes_Transaction() public {
        bytes32 txHash = keccak256("typesTx");
        _registerTxViaOperator(txHash);

        string memory ref = _buildTxRef(txHash, CHAIN_ID);
        IFraudRegistryHub.RegistryType[] memory types = hub.getRegisteredTypes(ref);

        assertEq(types.length, 1, "Should have exactly 1 type");
        assertTrue(types[0] == IFraudRegistryHub.RegistryType.TRANSACTION, "Type should be TRANSACTION");
    }

    /// @notice getRegisteredTypes returns empty array for unknown identifier
    function test_GetRegisteredTypes_Empty() public {
        address unknown = makeAddr("typesUnknown");
        string memory caip10 = _buildCaip10(unknown, CHAIN_ID);

        IFraudRegistryHub.RegistryType[] memory types = hub.getRegisteredTypes(caip10);
        assertEq(types.length, 0, "Should return empty array for unregistered identifier");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE / RECEIVE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hub's receive() accepts ETH deposits
    function test_Receive_AcceptsETH() public {
        uint256 balanceBefore = address(hub).balance;

        (bool success,) = address(hub).call{ value: 1 ether }("");
        assertTrue(success, "ETH transfer should succeed");
        assertEq(address(hub).balance, balanceBefore + 1 ether, "Hub balance should increase");
    }

    /// @notice withdrawFees is a no-op when hub has zero balance — no transfer, no event
    function test_WithdrawFees_NoopWhenZeroBalance() public {
        assertEq(address(hub).balance, 0, "Precondition: hub should have zero balance");

        uint256 recipientBefore = feeRecipient.balance;

        // Should silently return without reverting or emitting
        hub.withdrawFees();

        assertEq(feeRecipient.balance, recipientBefore, "Fee recipient balance should be unchanged");
        assertEq(address(hub).balance, 0, "Hub balance should remain zero");
    }

    /// @notice withdrawFees reverts when fee recipient rejects ETH
    function test_WithdrawFees_RevertsWhenRecipientFails() public {
        // Deploy a contract that rejects ETH
        RevertingReceiver badRecipient = new RevertingReceiver();
        hub.setFeeRecipient(address(badRecipient));

        // Fund the hub
        vm.deal(address(hub), 1 ether);

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__WithdrawFailed.selector);
        hub.withdrawFees();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN — registerTransactionsFromSpoke paused/unset
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice registerTransactionsFromSpoke reverts when hub is paused
    function test_RegisterTransactionsFromSpoke_RejectsWhenPaused() public {
        hub.pause();

        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = keccak256("pausedTx");
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(CHAIN_ID);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vm.prank(inbox);
        hub.registerTransactionsFromSpoke(
            makeAddr("reporter"), keccak256("data"), bytes32(0), bytes32(0), false, txHashes, chainIds, 1, bytes32(0)
        );
    }

    /// @notice registerTransactionsFromSpoke reverts when txRegistry is not set
    function test_RegisterTransactionsFromSpoke_RejectsWhenRegistryNotSet() public {
        FraudRegistryHub freshHub = new FraudRegistryHub(owner, feeRecipient);
        freshHub.setInbox(inbox);

        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = keccak256("noRegTx");
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(CHAIN_ID);

        vm.expectRevert(IFraudRegistryHub.FraudRegistryHub__ZeroAddress.selector);
        vm.prank(inbox);
        freshHub.registerTransactionsFromSpoke(
            makeAddr("reporter"), keccak256("data"), bytes32(0), bytes32(0), false, txHashes, chainIds, 1, bytes32(0)
        );
    }
}

/// @notice Helper contract that rejects all incoming ETH
contract RevertingReceiver {
    receive() external payable {
        revert();
    }
}
