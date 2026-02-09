// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EIP712Constants } from "../src/libraries/EIP712Constants.sol";
import { EIP712TestHelper } from "./helpers/EIP712TestHelper.sol";

/// @title EIP712ConstantsTest
/// @notice Verifies EIP-712 constants are correctly computed and that test helpers stay in sync.
/// @dev These tests catch typehash/statement desync between production constants, test helpers,
///      and the actual string literals. A typo in any location will cause a failure here.
contract EIP712ConstantsTest is EIP712TestHelper {
    // ═══════════════════════════════════════════════════════════════════════════
    // DOMAIN NAME & VERSION (defined in EIP712TestHelper, used by all contracts)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev All production contracts use EIP712("StolenWalletRegistry", "4").
    ///      These tests verify the test helper domain constants match.
    function test_walletDomainName() public pure {
        assertEq(
            keccak256(bytes(WALLET_DOMAIN_NAME)),
            keccak256(bytes("StolenWalletRegistry")),
            "WALLET_DOMAIN_NAME mismatch"
        );
    }

    function test_domainVersion() public pure {
        assertEq(keccak256(bytes(DOMAIN_VERSION)), keccak256(bytes("4")), "DOMAIN_VERSION mismatch");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WALLET TYPEHASHES — recompute from literal type strings
    // ═══════════════════════════════════════════════════════════════════════════

    function test_walletAckTypehash() public pure {
        bytes32 expected = keccak256(
            "AcknowledgementOfRegistry(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
        );
        assertEq(EIP712Constants.WALLET_ACK_TYPEHASH, expected, "WALLET_ACK_TYPEHASH mismatch");
    }

    function test_walletRegTypehash() public pure {
        bytes32 expected = keccak256(
            "Registration(string statement,address wallet,address forwarder,uint64 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
        );
        assertEq(EIP712Constants.WALLET_REG_TYPEHASH, expected, "WALLET_REG_TYPEHASH mismatch");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSACTION BATCH TYPEHASHES — recompute from literal type strings
    // ═══════════════════════════════════════════════════════════════════════════

    function test_txBatchAckTypehash() public pure {
        bytes32 expected = keccak256(
            "TransactionBatchAcknowledgement(string statement,address reporter,address forwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
        );
        assertEq(EIP712Constants.TX_BATCH_ACK_TYPEHASH, expected, "TX_BATCH_ACK_TYPEHASH mismatch");
    }

    function test_txBatchRegTypehash() public pure {
        bytes32 expected = keccak256(
            "TransactionBatchRegistration(string statement,address reporter,address forwarder,bytes32 dataHash,bytes32 reportedChainId,uint32 transactionCount,uint256 nonce,uint256 deadline)"
        );
        assertEq(EIP712Constants.TX_BATCH_REG_TYPEHASH, expected, "TX_BATCH_REG_TYPEHASH mismatch");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATEMENT HASHES — verify pre-computed hashes match the string literals
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ackStatementHash() public pure {
        assertEq(
            EIP712Constants.ACK_STATEMENT_HASH,
            keccak256(bytes(EIP712Constants.ACK_STATEMENT)),
            "ACK_STATEMENT_HASH does not match ACK_STATEMENT"
        );
    }

    function test_regStatementHash() public pure {
        assertEq(
            EIP712Constants.REG_STATEMENT_HASH,
            keccak256(bytes(EIP712Constants.REG_STATEMENT)),
            "REG_STATEMENT_HASH does not match REG_STATEMENT"
        );
    }

    function test_txAckStatementHash() public pure {
        assertEq(
            EIP712Constants.TX_ACK_STATEMENT_HASH,
            keccak256(bytes(EIP712Constants.TX_ACK_STATEMENT)),
            "TX_ACK_STATEMENT_HASH does not match TX_ACK_STATEMENT"
        );
    }

    function test_txRegStatementHash() public pure {
        assertEq(
            EIP712Constants.TX_REG_STATEMENT_HASH,
            keccak256(bytes(EIP712Constants.TX_REG_STATEMENT)),
            "TX_REG_STATEMENT_HASH does not match TX_REG_STATEMENT"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST HELPER SYNC — verify EIP712TestHelper imports match production
    // ═══════════════════════════════════════════════════════════════════════════

    function test_testHelper_walletAckStatement() public pure {
        assertEq(
            keccak256(bytes(WALLET_ACK_STATEMENT)),
            keccak256(bytes(EIP712Constants.ACK_STATEMENT)),
            "EIP712TestHelper WALLET_ACK_STATEMENT desynced from production"
        );
    }

    function test_testHelper_walletRegStatement() public pure {
        assertEq(
            keccak256(bytes(WALLET_REG_STATEMENT)),
            keccak256(bytes(EIP712Constants.REG_STATEMENT)),
            "EIP712TestHelper WALLET_REG_STATEMENT desynced from production"
        );
    }

    function test_testHelper_txAckStatement() public pure {
        assertEq(
            keccak256(bytes(TX_ACK_STATEMENT)),
            keccak256(bytes(EIP712Constants.TX_ACK_STATEMENT)),
            "EIP712TestHelper TX_ACK_STATEMENT desynced from production"
        );
    }

    function test_testHelper_txRegStatement() public pure {
        assertEq(
            keccak256(bytes(TX_REG_STATEMENT)),
            keccak256(bytes(EIP712Constants.TX_REG_STATEMENT)),
            "EIP712TestHelper TX_REG_STATEMENT desynced from production"
        );
    }

    function test_testHelper_walletAckTypehash() public pure {
        assertEq(
            WALLET_ACK_TYPEHASH,
            EIP712Constants.WALLET_ACK_TYPEHASH,
            "EIP712TestHelper WALLET_ACK_TYPEHASH desynced from production"
        );
    }

    function test_testHelper_walletRegTypehash() public pure {
        assertEq(
            WALLET_REG_TYPEHASH,
            EIP712Constants.WALLET_REG_TYPEHASH,
            "EIP712TestHelper WALLET_REG_TYPEHASH desynced from production"
        );
    }

    function test_testHelper_txAckTypehash() public pure {
        assertEq(
            TX_ACK_TYPEHASH,
            EIP712Constants.TX_BATCH_ACK_TYPEHASH,
            "EIP712TestHelper TX_ACK_TYPEHASH desynced from production"
        );
    }

    function test_testHelper_txRegTypehash() public pure {
        assertEq(
            TX_REG_TYPEHASH,
            EIP712Constants.TX_BATCH_REG_TYPEHASH,
            "EIP712TestHelper TX_REG_TYPEHASH desynced from production"
        );
    }
}
