// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { CrossChainInbox } from "../src/CrossChainInbox.sol";
import { FraudRegistryHub } from "../src/FraudRegistryHub.sol";
import { IFraudRegistryHub } from "../src/interfaces/IFraudRegistryHub.sol";
import { WalletRegistry } from "../src/registries/WalletRegistry.sol";
import { TransactionRegistry } from "../src/registries/TransactionRegistry.sol";
import { ContractRegistry } from "../src/registries/ContractRegistry.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";

/// @title CrossChainInboxTest
/// @notice Tests for CrossChainInbox: message handling, trust management, constructor validation
contract CrossChainInboxTest is Test {
    MockMailbox public mailbox;
    FraudRegistryHub public hub;
    CrossChainInbox public inboxContract;
    WalletRegistry public walletRegistry;
    TransactionRegistry public txRegistry;
    ContractRegistry public contractRegistry;

    address public owner;
    address public feeRecipient;
    address public spokeAddress;
    bytes32 public spokeRegistryBytes32;

    uint32 public constant SPOKE_CHAIN_ID = 11_155_420; // OP Sepolia
    uint32 public constant HUB_CHAIN_ID = 84_532; // Base Sepolia
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    function setUp() public {
        vm.warp(1_704_067_200); // 2024-01-01

        owner = address(this);
        feeRecipient = makeAddr("feeRecipient");
        spokeAddress = makeAddr("spokeRegistry");
        spokeRegistryBytes32 = bytes32(uint256(uint160(spokeAddress)));

        // Deploy mock mailbox
        mailbox = new MockMailbox(HUB_CHAIN_ID);

        // Deploy registries
        walletRegistry = new WalletRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        txRegistry = new TransactionRegistry(owner, address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        contractRegistry = new ContractRegistry(owner);

        // Deploy hub
        hub = new FraudRegistryHub(owner, feeRecipient);
        hub.setWalletRegistry(address(walletRegistry));
        hub.setTransactionRegistry(address(txRegistry));
        hub.setContractRegistry(address(contractRegistry));

        // Wire registries -> hub
        walletRegistry.setHub(address(hub));
        txRegistry.setHub(address(hub));

        // Deploy inbox
        inboxContract = new CrossChainInbox(address(mailbox), address(hub), owner);

        // Set inbox on hub
        hub.setInbox(address(inboxContract));

        // Configure trusted source
        inboxContract.setTrustedSource(SPOKE_CHAIN_ID, spokeRegistryBytes32, true);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Build a valid wallet registration message
    function _buildWalletMessage(address walletAddr) internal view returns (bytes memory) {
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(walletAddr))),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(1)),
            incidentTimestamp: uint64(block.timestamp - 1 days),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID)),
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: keccak256("dummy")
        });
        return CrossChainMessage.encodeWalletRegistration(payload);
    }

    /// @dev Build a valid transaction batch message
    function _buildTxBatchMessage(bytes32 txHash) internal returns (bytes memory) {
        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID));

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            dataHash: keccak256(abi.encode(txHashes, chainIds)),
            reporter: makeAddr("reporter"),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID)),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID)),
            transactionCount: 1,
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            transactionHashes: txHashes,
            chainIds: chainIds
        });
        return CrossChainMessage.encodeTransactionBatch(payload);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Constructor rejects zero mailbox address
    function test_Constructor_RejectsZeroMailbox() public {
        vm.expectRevert(CrossChainInbox.CrossChainInbox__ZeroAddress.selector);
        new CrossChainInbox(address(0), address(hub), owner);
    }

    /// @notice Constructor rejects zero hub address
    function test_Constructor_RejectsZeroHub() public {
        vm.expectRevert(CrossChainInbox.CrossChainInbox__ZeroAddress.selector);
        new CrossChainInbox(address(mailbox), address(0), owner);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET MESSAGE HANDLING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Wallet registration message is received, wallet stored, events emitted
    function test_HandleWalletRegistration_Success() public {
        address wallet = makeAddr("crossChainWallet");
        bytes memory encoded = _buildWalletMessage(wallet);
        bytes32 expectedMessageId = keccak256(encoded);

        vm.expectEmit(true, true, false, true);
        emit CrossChainInbox.WalletRegistrationReceived(
            SPOKE_CHAIN_ID, bytes32(uint256(uint160(wallet))), expectedMessageId
        );

        mailbox.simulateReceive(address(inboxContract), SPOKE_CHAIN_ID, spokeRegistryBytes32, encoded);

        // Verify wallet stored
        assertTrue(walletRegistry.isWalletRegistered(wallet), "Wallet should be registered after cross-chain message");
    }

    /// @notice Rejects message from non-mailbox caller
    function test_HandleWalletRegistration_RejectsNonMailbox() public {
        address wallet = makeAddr("wallet");
        bytes memory encoded = _buildWalletMessage(wallet);

        vm.expectRevert(CrossChainInbox.CrossChainInbox__OnlyMailbox.selector);
        vm.prank(makeAddr("notMailbox"));
        inboxContract.handle(SPOKE_CHAIN_ID, spokeRegistryBytes32, encoded);
    }

    /// @notice Rejects message from untrusted source
    function test_HandleWalletRegistration_RejectsUntrustedSource() public {
        address wallet = makeAddr("wallet");
        bytes memory encoded = _buildWalletMessage(wallet);
        bytes32 untrustedSender = bytes32(uint256(uint160(makeAddr("untrusted"))));

        vm.expectRevert(CrossChainInbox.CrossChainInbox__UntrustedSource.selector);
        mailbox.simulateReceive(address(inboxContract), SPOKE_CHAIN_ID, untrustedSender, encoded);
    }

    /// @notice Rejects when payload sourceChainId does not match Hyperlane origin
    function test_HandleWalletRegistration_RejectsSourceChainMismatch() public {
        // Build message with sourceChainId = caip2Hash(1) (Ethereum mainnet)
        // but send from SPOKE_CHAIN_ID (OP Sepolia)
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: bytes32(0),
            identifier: bytes32(uint256(uint160(makeAddr("wallet")))),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(1)),
            incidentTimestamp: uint64(block.timestamp - 1 days),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(1)), // Mismatch: says chain 1, sent from SPOKE_CHAIN_ID
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            registrationHash: keccak256("dummy")
        });
        bytes memory encoded = CrossChainMessage.encodeWalletRegistration(payload);

        vm.expectRevert(CrossChainInbox.CrossChainInbox__SourceChainMismatch.selector);
        mailbox.simulateReceive(address(inboxContract), SPOKE_CHAIN_ID, spokeRegistryBytes32, encoded);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH MESSAGE HANDLING
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Transaction batch message is received and transactions stored
    function test_HandleTransactionBatch_Success() public {
        bytes32 txHash = keccak256("crossChainTx");
        bytes memory encoded = _buildTxBatchMessage(txHash);

        bytes32 expectedMessageId = keccak256(encoded);
        address reporter = makeAddr("reporter");

        vm.expectEmit(true, true, false, true);
        emit CrossChainInbox.TransactionBatchReceived(
            SPOKE_CHAIN_ID,
            reporter,
            keccak256(abi.encode(_singleArray(txHash), _singleArray(CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID))))),
            expectedMessageId
        );

        mailbox.simulateReceive(address(inboxContract), SPOKE_CHAIN_ID, spokeRegistryBytes32, encoded);

        // Verify tx stored
        bytes32 chainId = CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID));
        assertTrue(txRegistry.isTransactionRegistered(txHash, chainId), "Transaction should be registered");
    }

    /// @dev Helper to create a single-element bytes32 array
    function _singleArray(bytes32 val) internal pure returns (bytes32[] memory) {
        bytes32[] memory arr = new bytes32[](1);
        arr[0] = val;
        return arr;
    }

    /// @notice Rejects transaction batch when sourceChainId mismatches origin
    function test_HandleTransactionBatch_RejectsSourceChainMismatch() public {
        bytes32 txHash = keccak256("tx");
        bytes32 chainId = CAIP10Evm.caip2Hash(uint64(SPOKE_CHAIN_ID));
        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = txHash;
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = chainId;

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            dataHash: keccak256(abi.encode(txHashes, chainIds)),
            reporter: makeAddr("reporter"),
            reportedChainId: chainId,
            sourceChainId: CAIP10Evm.caip2Hash(uint64(1)), // Mismatch
            transactionCount: 1,
            isSponsored: false,
            nonce: 0,
            timestamp: uint64(block.timestamp),
            transactionHashes: txHashes,
            chainIds: chainIds
        });
        bytes memory encoded = CrossChainMessage.encodeTransactionBatch(payload);

        vm.expectRevert(CrossChainInbox.CrossChainInbox__SourceChainMismatch.selector);
        mailbox.simulateReceive(address(inboxContract), SPOKE_CHAIN_ID, spokeRegistryBytes32, encoded);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNKNOWN MESSAGE TYPE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Message with unknown type byte (0x03) reverts
    function test_Handle_RejectsUnknownMessageType() public {
        // Manually craft a message with type 0x03
        bytes memory encoded = abi.encode(
            uint8(2), // version 2
            bytes1(0x03), // unknown type
            bytes32(0),
            bytes32(0),
            bytes32(0),
            bytes32(0),
            uint64(0),
            bytes32(0),
            false,
            uint256(0),
            uint64(0),
            bytes32(0)
        );

        vm.expectRevert(CrossChainInbox.CrossChainInbox__UnknownMessageType.selector);
        mailbox.simulateReceive(address(inboxContract), SPOKE_CHAIN_ID, spokeRegistryBytes32, encoded);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRUST MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can set trusted source, emits TrustedSourceUpdated
    function test_SetTrustedSource_Success() public {
        uint32 newChainId = 42_161; // Arbitrum One
        bytes32 newSpoke = bytes32(uint256(uint160(makeAddr("arbSpoke"))));

        vm.expectEmit(true, true, false, true);
        emit CrossChainInbox.TrustedSourceUpdated(newChainId, newSpoke, true);

        inboxContract.setTrustedSource(newChainId, newSpoke, true);

        assertTrue(inboxContract.isTrustedSource(newChainId, newSpoke), "Source should be trusted");
    }

    /// @notice Owner can revoke trust by setting to false
    function test_SetTrustedSource_CanRevoke() public {
        // Verify currently trusted
        assertTrue(inboxContract.isTrustedSource(SPOKE_CHAIN_ID, spokeRegistryBytes32));

        vm.expectEmit(true, true, false, true);
        emit CrossChainInbox.TrustedSourceUpdated(SPOKE_CHAIN_ID, spokeRegistryBytes32, false);

        inboxContract.setTrustedSource(SPOKE_CHAIN_ID, spokeRegistryBytes32, false);

        assertFalse(inboxContract.isTrustedSource(SPOKE_CHAIN_ID, spokeRegistryBytes32), "Source should be revoked");
    }

    /// @notice Setting zero address as trusted source reverts
    function test_SetTrustedSource_RejectsZeroAddressWhenTrusting() public {
        vm.expectRevert(CrossChainInbox.CrossChainInbox__ZeroAddress.selector);
        inboxContract.setTrustedSource(SPOKE_CHAIN_ID, bytes32(0), true);
    }

    /// @notice Non-owner cannot set trusted source
    function test_SetTrustedSource_RejectsNonOwner() public {
        address nonOwner = makeAddr("nonOwner");

        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        vm.prank(nonOwner);
        inboxContract.setTrustedSource(SPOKE_CHAIN_ID, spokeRegistryBytes32, true);
    }
}
