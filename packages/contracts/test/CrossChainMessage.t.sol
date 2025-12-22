// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";

/// @notice Helper contract to call decodeRegistration with calldata
contract DecoderHelper {
    function decode(bytes calldata data) external pure returns (CrossChainMessage.RegistrationPayload memory payload) {
        return CrossChainMessage.decodeRegistration(data);
    }
}

contract CrossChainMessageTest is Test {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;

    DecoderHelper decoder;

    function setUp() public {
        decoder = new DecoderHelper();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENCODING TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_EncodeRegistration_Success() public pure {
        CrossChainMessage.RegistrationPayload memory payload = CrossChainMessage.RegistrationPayload({
            wallet: address(0x1234567890123456789012345678901234567890),
            sourceChainId: 11_155_420, // Optimism Sepolia
            isSponsored: true,
            nonce: 42,
            timestamp: 1_700_000_000,
            registrationHash: keccak256("test")
        });

        bytes memory encoded = payload.encodeRegistration();

        // Should have encoded 8 values (version, type, 6 payload fields)
        // Each ABI-encoded value is 32 bytes = 256 bytes total
        assertEq(encoded.length, 256, "Encoded length should be 256 bytes");
    }

    function test_DecodeRegistration_Success() public view {
        // Create and encode a payload
        address testWallet = address(0xabCDeF0123456789AbcdEf0123456789aBCDEF01);
        CrossChainMessage.RegistrationPayload memory original = CrossChainMessage.RegistrationPayload({
            wallet: testWallet,
            sourceChainId: 84_532, // Base Sepolia
            isSponsored: false,
            nonce: 100,
            timestamp: 1_700_000_000,
            registrationHash: keccak256("registration")
        });

        bytes memory encoded = original.encodeRegistration();

        // Decode it back using helper
        CrossChainMessage.RegistrationPayload memory decoded = decoder.decode(encoded);

        // Verify all fields match
        assertEq(decoded.wallet, original.wallet, "wallet mismatch");
        assertEq(decoded.sourceChainId, original.sourceChainId, "sourceChainId mismatch");
        assertEq(decoded.isSponsored, original.isSponsored, "isSponsored mismatch");
        assertEq(decoded.nonce, original.nonce, "nonce mismatch");
        assertEq(decoded.timestamp, original.timestamp, "timestamp mismatch");
        assertEq(decoded.registrationHash, original.registrationHash, "registrationHash mismatch");
    }

    function testFuzz_EncodeDecodeRoundtrip(
        address wallet,
        uint32 sourceChainId,
        bool isSponsored,
        uint256 nonce,
        uint64 timestamp,
        bytes32 registrationHash
    ) public view {
        // Skip zero address (would fail validation in real contract)
        vm.assume(wallet != address(0));

        CrossChainMessage.RegistrationPayload memory original = CrossChainMessage.RegistrationPayload({
            wallet: wallet,
            sourceChainId: sourceChainId,
            isSponsored: isSponsored,
            nonce: nonce,
            timestamp: timestamp,
            registrationHash: registrationHash
        });

        bytes memory encoded = original.encodeRegistration();
        CrossChainMessage.RegistrationPayload memory decoded = decoder.decode(encoded);

        assertEq(decoded.wallet, original.wallet, "wallet mismatch");
        assertEq(decoded.sourceChainId, original.sourceChainId, "sourceChainId mismatch");
        assertEq(decoded.isSponsored, original.isSponsored, "isSponsored mismatch");
        assertEq(decoded.nonce, original.nonce, "nonce mismatch");
        assertEq(decoded.timestamp, original.timestamp, "timestamp mismatch");
        assertEq(decoded.registrationHash, original.registrationHash, "registrationHash mismatch");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DECODING ERROR TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_DecodeRegistration_InvalidVersion_Reverts() public {
        // Create payload with wrong version
        bytes memory invalidPayload = abi.encode(
            uint8(99), // Wrong version (should be 1)
            CrossChainMessage.MSG_TYPE_REGISTRATION,
            address(0x1234),
            uint32(1),
            false,
            uint256(0),
            uint64(0),
            bytes32(0)
        );

        vm.expectRevert(CrossChainMessage.CrossChainMessage__UnsupportedVersion.selector);
        decoder.decode(invalidPayload);
    }

    function test_DecodeRegistration_InvalidMessageType_Reverts() public {
        // Create payload with wrong message type
        bytes memory invalidPayload = abi.encode(
            CrossChainMessage.MESSAGE_VERSION,
            bytes1(0x99), // Wrong message type
            address(0x1234),
            uint32(1),
            false,
            uint256(0),
            uint64(0),
            bytes32(0)
        );

        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageType.selector);
        decoder.decode(invalidPayload);
    }

    function test_DecodeRegistration_TruncatedData_Reverts() public {
        // Create truncated payload (missing last field - only 224 bytes instead of 256)
        bytes memory truncatedPayload = abi.encode(
            CrossChainMessage.MESSAGE_VERSION,
            CrossChainMessage.MSG_TYPE_REGISTRATION,
            address(0x1234),
            uint32(1),
            false,
            uint256(0),
            uint64(0)
            // Missing: bytes32 registrationHash
        );

        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector);
        decoder.decode(truncatedPayload);
    }

    function test_DecodeRegistration_EmptyData_Reverts() public {
        bytes memory emptyPayload = "";

        vm.expectRevert(CrossChainMessage.CrossChainMessage__InvalidMessageLength.selector);
        decoder.decode(emptyPayload);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_AddressToBytes32() public pure {
        address addr = 0x1234567890123456789012345678901234567890;
        bytes32 result = CrossChainMessage.addressToBytes32(addr);

        // Should be zero-padded on the left
        assertEq(result, bytes32(uint256(uint160(addr))));
    }

    function test_Bytes32ToAddress() public pure {
        bytes32 b = bytes32(uint256(uint160(0x1234567890123456789012345678901234567890)));
        address result = CrossChainMessage.bytes32ToAddress(b);

        assertEq(result, address(0x1234567890123456789012345678901234567890));
    }

    function testFuzz_AddressBytes32Roundtrip(address addr) public pure {
        bytes32 b = CrossChainMessage.addressToBytes32(addr);
        address recovered = CrossChainMessage.bytes32ToAddress(b);

        assertEq(recovered, addr);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_MessageConstants() public pure {
        assertEq(CrossChainMessage.MESSAGE_VERSION, 1, "version should be 1");
        assertEq(CrossChainMessage.MSG_TYPE_REGISTRATION, bytes1(0x01), "registration type should be 0x01");
    }
}
