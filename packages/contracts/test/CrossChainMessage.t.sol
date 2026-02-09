// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { CAIP10Evm } from "../src/libraries/CAIP10Evm.sol";

/// @title CrossChainMessageCaller
/// @notice Helper contract to expose calldata-parameter library functions for testing
/// @dev Library functions that take `bytes calldata` cannot be tested directly from a test
///      contract since Solidity test functions receive `bytes memory`. This wrapper converts
///      memory → calldata at the external function boundary.
contract CrossChainMessageCaller {
    function decodeWallet(bytes calldata data)
        external
        pure
        returns (CrossChainMessage.WalletRegistrationPayload memory)
    {
        return CrossChainMessage.decodeWalletRegistration(data);
    }

    function decodeTxBatch(bytes calldata data)
        external
        pure
        returns (CrossChainMessage.TransactionBatchPayload memory)
    {
        return CrossChainMessage.decodeTransactionBatch(data);
    }

    function getMsgType(bytes calldata data) external pure returns (bytes1) {
        return CrossChainMessage.getMessageType(data);
    }
}

/// @title CrossChainMessageTest
/// @notice Tests for CrossChainMessage library: encode/decode round-trips, message type extraction, utilities
contract CrossChainMessageTest is Test {
    CrossChainMessageCaller public caller;

    function setUp() public {
        caller = new CrossChainMessageCaller();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET REGISTRATION ENCODE/DECODE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Encode then decode a wallet registration payload — all fields must match
    function test_WalletRegistration_RoundTrip() public view {
        CrossChainMessage.WalletRegistrationPayload memory original = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: keccak256("8453"),
            identifier: bytes32(uint256(uint160(address(0xBEEF)))),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(8453)),
            incidentTimestamp: uint64(1_704_067_200),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(11_155_420)),
            isSponsored: true,
            nonce: 42,
            timestamp: uint64(1_704_070_800),
            registrationHash: keccak256("regHash")
        });

        bytes memory encoded = CrossChainMessage.encodeWalletRegistration(original);
        CrossChainMessage.WalletRegistrationPayload memory decoded = caller.decodeWallet(encoded);

        assertEq(decoded.namespaceHash, original.namespaceHash, "namespaceHash mismatch");
        assertEq(decoded.chainRef, original.chainRef, "chainRef mismatch");
        assertEq(decoded.identifier, original.identifier, "identifier mismatch");
        assertEq(decoded.reportedChainId, original.reportedChainId, "reportedChainId mismatch");
        assertEq(decoded.incidentTimestamp, original.incidentTimestamp, "incidentTimestamp mismatch");
        assertEq(decoded.sourceChainId, original.sourceChainId, "sourceChainId mismatch");
        assertEq(decoded.isSponsored, original.isSponsored, "isSponsored mismatch");
        assertEq(decoded.nonce, original.nonce, "nonce mismatch");
        assertEq(decoded.timestamp, original.timestamp, "timestamp mismatch");
        assertEq(decoded.registrationHash, original.registrationHash, "registrationHash mismatch");
    }

    /// @notice Decoding a too-short message reverts with InvalidMessageLength
    function test_WalletRegistration_RejectsShortMessage() public {
        // 383 bytes = 1 less than minimum 384
        bytes memory tooShort = new bytes(383);

        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector);
        caller.decodeWallet(tooShort);
    }

    /// @notice Exactly 384 bytes does not revert with InvalidMessageLength (boundary check)
    function test_WalletRegistration_AcceptsMinimumLength() public {
        bytes memory exactMinimum = new bytes(384);
        // 384 bytes passes the length check; may revert for other reasons (zero fields)
        // but must NOT revert with InvalidMessageLength
        try caller.decodeWallet(exactMinimum) { }
        catch (bytes memory reason) {
            // Ensure revert is NOT InvalidMessageLength
            bytes4 selector = bytes4(reason);
            assertTrue(
                selector != CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector,
                "384-byte message should not fail length check"
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH ENCODE/DECODE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Encode then decode a transaction batch payload — all fields including dynamic arrays
    function test_TransactionBatch_RoundTrip() public view {
        bytes32[] memory txHashes = new bytes32[](3);
        txHashes[0] = keccak256("tx1");
        txHashes[1] = keccak256("tx2");
        txHashes[2] = keccak256("tx3");

        bytes32[] memory chainIds = new bytes32[](3);
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(8453));
        chainIds[1] = CAIP10Evm.caip2Hash(uint64(10));
        chainIds[2] = CAIP10Evm.caip2Hash(uint64(42_161));

        CrossChainMessage.TransactionBatchPayload memory original = CrossChainMessage.TransactionBatchPayload({
            dataHash: keccak256(abi.encode(txHashes, chainIds)),
            reporter: address(0xCAFE),
            reportedChainId: CAIP10Evm.caip2Hash(uint64(8453)),
            sourceChainId: CAIP10Evm.caip2Hash(uint64(11_155_420)),
            transactionCount: 3,
            isSponsored: false,
            nonce: 7,
            timestamp: uint64(1_704_067_200),
            transactionHashes: txHashes,
            chainIds: chainIds
        });

        bytes memory encoded = CrossChainMessage.encodeTransactionBatch(original);
        CrossChainMessage.TransactionBatchPayload memory decoded = caller.decodeTxBatch(encoded);

        assertEq(decoded.dataHash, original.dataHash, "dataHash mismatch");
        assertEq(decoded.reporter, original.reporter, "reporter mismatch");
        assertEq(decoded.reportedChainId, original.reportedChainId, "reportedChainId mismatch");
        assertEq(decoded.sourceChainId, original.sourceChainId, "sourceChainId mismatch");
        assertEq(decoded.transactionCount, original.transactionCount, "transactionCount mismatch");
        assertEq(decoded.isSponsored, original.isSponsored, "isSponsored mismatch");
        assertEq(decoded.nonce, original.nonce, "nonce mismatch");
        assertEq(decoded.timestamp, original.timestamp, "timestamp mismatch");

        // Verify dynamic arrays
        assertEq(decoded.transactionHashes.length, 3, "txHashes length mismatch");
        assertEq(decoded.chainIds.length, 3, "chainIds length mismatch");
        for (uint256 i = 0; i < 3; i++) {
            assertEq(decoded.transactionHashes[i], txHashes[i], "txHash mismatch at index");
            assertEq(decoded.chainIds[i], chainIds[i], "chainId mismatch at index");
        }
    }

    /// @notice Decoding a too-short transaction batch message reverts
    function test_TransactionBatch_RejectsShortMessage() public {
        bytes memory tooShort = new bytes(383);

        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector);
        caller.decodeTxBatch(tooShort);
    }

    /// @notice Exactly 384 bytes does not revert with InvalidMessageLength for tx batch (boundary check)
    function test_TransactionBatch_AcceptsMinimumLength() public {
        bytes memory exactMinimum = new bytes(384);
        try caller.decodeTxBatch(exactMinimum) { }
        catch (bytes memory reason) {
            bytes4 selector = bytes4(reason);
            assertTrue(
                selector != CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector,
                "384-byte tx batch should not fail length check"
            );
        }
    }

    /// @notice Decoding when transactionCount does not match array lengths reverts
    function test_TransactionBatch_RejectsBatchSizeMismatch() public {
        // Encode with transactionCount = 5, but arrays have length 1
        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = keccak256("tx");
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = CAIP10Evm.caip2Hash(uint64(8453));

        // Manually build mismatched payload by encoding with wrong count
        bytes memory encoded = abi.encode(
            uint8(2), // version
            bytes1(0x02), // MSG_TYPE_TRANSACTION_BATCH
            keccak256("data"),
            makeAddr("reporter"),
            CAIP10Evm.caip2Hash(uint64(8453)),
            CAIP10Evm.caip2Hash(uint64(11_155_420)),
            uint32(5), // MISMATCH: says 5, arrays have 1
            false,
            uint256(0),
            uint64(0),
            txHashes,
            chainIds
        );

        vm.expectRevert(CrossChainMessage.CrossChainMessage__BatchSizeMismatch.selector);
        caller.decodeTxBatch(encoded);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MESSAGE TYPE EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice getMessageType returns 0x01 for wallet messages
    function test_GetMessageType_Wallet() public view {
        CrossChainMessage.WalletRegistrationPayload memory payload = CrossChainMessage.WalletRegistrationPayload({
            namespaceHash: keccak256("eip155"),
            chainRef: bytes32(0),
            identifier: bytes32(uint256(1)),
            reportedChainId: bytes32(0),
            incidentTimestamp: 0,
            sourceChainId: bytes32(0),
            isSponsored: false,
            nonce: 0,
            timestamp: 0,
            registrationHash: bytes32(0)
        });
        bytes memory encoded = CrossChainMessage.encodeWalletRegistration(payload);

        bytes1 msgType = caller.getMsgType(encoded);
        assertEq(msgType, bytes1(0x01), "Wallet message should have type 0x01");
    }

    /// @notice getMessageType returns 0x02 for transaction batch messages
    function test_GetMessageType_TransactionBatch() public view {
        bytes32[] memory txHashes = new bytes32[](1);
        txHashes[0] = keccak256("tx");
        bytes32[] memory chainIds = new bytes32[](1);
        chainIds[0] = bytes32(0);

        CrossChainMessage.TransactionBatchPayload memory payload = CrossChainMessage.TransactionBatchPayload({
            dataHash: bytes32(0),
            reporter: address(0),
            reportedChainId: bytes32(0),
            sourceChainId: bytes32(0),
            transactionCount: 1,
            isSponsored: false,
            nonce: 0,
            timestamp: 0,
            transactionHashes: txHashes,
            chainIds: chainIds
        });
        bytes memory encoded = CrossChainMessage.encodeTransactionBatch(payload);

        bytes1 msgType = caller.getMsgType(encoded);
        assertEq(msgType, bytes1(0x02), "Transaction batch message should have type 0x02");
    }

    /// @notice getMessageType reverts on data shorter than 64 bytes
    function test_GetMessageType_RejectsShortMessage() public {
        bytes memory tooShort = new bytes(63);

        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector);
        caller.getMsgType(tooShort);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice addressToBytes32 -> bytes32ToAddress round-trip preserves original address
    function test_AddressToBytes32_RoundTrip() public pure {
        address original = address(0x742d35cC6634c0532925A3b844bc9E7595F0beB1);
        bytes32 encoded = CrossChainMessage.addressToBytes32(original);
        address decoded = CrossChainMessage.bytes32ToAddress(encoded);
        assertEq(decoded, original, "Round-trip should preserve address");
    }

    /// @notice bytes32ToAddress only uses lower 160 bits, high bits are ignored
    function test_Bytes32ToAddress_TruncatesHighBits() public pure {
        // Set high bits that should be ignored
        bytes32 withHighBits = bytes32(uint256(type(uint256).max));
        address result = CrossChainMessage.bytes32ToAddress(withHighBits);

        // Lower 160 bits of uint256.max = address(type(uint160).max) = 0xFFfF...
        assertEq(result, address(type(uint160).max), "Should only use lower 160 bits");

        // Verify that a known address value in low bits is preserved despite high bits
        address expected = address(0x1234567890AbcdEF1234567890aBcdef12345678);
        bytes32 packed = bytes32(uint256(uint160(expected)) | (uint256(0xDEAD) << 160));
        address unpacked = CrossChainMessage.bytes32ToAddress(packed);
        assertEq(unpacked, expected, "High bits should be truncated");
    }
}
