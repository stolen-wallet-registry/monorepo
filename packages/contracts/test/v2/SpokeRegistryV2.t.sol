// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SpokeRegistryV2 } from "../../src/v2/SpokeRegistryV2.sol";
import { ISpokeRegistryV2 } from "../../src/v2/interfaces/ISpokeRegistryV2.sol";
import { CrossChainMessageV2 } from "../../src/v2/libraries/CrossChainMessageV2.sol";
import { CAIP10 } from "../../src/v2/libraries/CAIP10.sol";
import { HyperlaneAdapter } from "../../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../../src/FeeManager.sol";
import { MockMailbox } from "../mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "../mocks/MockInterchainGasPaymaster.sol";
import { MockAggregator } from "../mocks/MockAggregator.sol";

/// @title SpokeRegistryV2Test
/// @notice Tests for SpokeRegistryV2 cross-chain wallet registration
contract SpokeRegistryV2Test is Test {
    SpokeRegistryV2 public spoke;
    HyperlaneAdapter public bridgeAdapter;
    FeeManager public feeManager;
    MockMailbox public mailbox;
    MockInterchainGasPaymaster public gasPaymaster;
    MockAggregator public oracle;

    // Test accounts
    uint256 internal walletPrivateKey;
    address internal wallet;
    address internal forwarder;
    address internal owner;

    // Timing configuration
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    // Hub configuration
    uint32 internal constant HUB_CHAIN_ID = 8453; // Base
    uint32 internal constant SPOKE_CHAIN_ID = 11_155_420; // OP Sepolia
    bytes32 internal constant HUB_INBOX = bytes32(uint256(uint160(0x1234567890123456789012345678901234567890)));

    // EIP-712 constants (V2 - includes reportedChainId and incidentTimestamp)
    bytes32 internal constant ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address wallet,address forwarder,bytes32 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant REG_TYPEHASH = keccak256(
        "Registration(string statement,address wallet,address forwarder,bytes32 reportedChainId,uint64 incidentTimestamp,uint256 nonce,uint256 deadline)"
    );

    string internal constant ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.";
    string internal constant REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.";

    // Events
    event WalletAcknowledged(
        address indexed wallet,
        address indexed forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        bool isSponsored
    );
    event RegistrationSentToHub(address indexed wallet, bytes32 indexed messageId, uint32 hubChainId);

    function setUp() public {
        // Set chain ID for spoke
        vm.chainId(SPOKE_CHAIN_ID);

        // Set block timestamp to something reasonable
        vm.warp(1_704_067_200); // 2024-01-01

        // Create test accounts
        walletPrivateKey = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
        wallet = vm.addr(walletPrivateKey);
        forwarder = makeAddr("forwarder");
        owner = address(this);

        // Deploy mocks and infrastructure
        mailbox = new MockMailbox(SPOKE_CHAIN_ID);
        gasPaymaster = new MockInterchainGasPaymaster();

        bridgeAdapter = new HyperlaneAdapter(owner, address(mailbox), address(gasPaymaster));
        bridgeAdapter.setDomainSupport(HUB_CHAIN_ID, true);

        oracle = new MockAggregator(300_000_000_000); // $3000 ETH price
        feeManager = new FeeManager(owner, address(oracle));

        // Deploy SpokeRegistryV2
        spoke = new SpokeRegistryV2(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            HUB_CHAIN_ID,
            HUB_INBOX,
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1 // bridgeId = Hyperlane
        );

        // Fund test accounts
        vm.deal(wallet, 10 ether);
        vm.deal(forwarder, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"), // V2 uses version 5
                block.chainid,
                address(spoke)
            )
        );
    }

    function _signAck(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH,
                keccak256(bytes(ACK_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    function _signReg(
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                REG_TYPEHASH,
                keccak256(bytes(REG_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        return vm.sign(privateKey, digest);
    }

    function _doAck(address _forwarder, bytes32 reportedChainId, uint64 incidentTimestamp) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, _forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(_forwarder);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    function _skipToRegistrationWindow() internal {
        // Get current acknowledgement and skip to start block
        ISpokeRegistryV2.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        vm.roll(ack.startBlock);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACKNOWLEDGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Acknowledgement succeeds with valid signature including incident data
    function test_Acknowledge_Success() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1)); // Mainnet
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.expectEmit(true, true, true, true);
        emit WalletAcknowledged(wallet, forwarder, reportedChainId, incidentTimestamp, true);

        _doAck(forwarder, reportedChainId, incidentTimestamp);

        // Verify acknowledgement stored
        assertTrue(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 1);

        // Verify incident data stored
        ISpokeRegistryV2.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        assertEq(ack.trustedForwarder, forwarder);
        assertEq(ack.reportedChainId, reportedChainId);
        assertEq(ack.incidentTimestamp, incidentTimestamp);
    }

    /// @notice Self-relay (wallet is own forwarder) works
    function test_Acknowledge_SelfRelay() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, wallet, reportedChainId, incidentTimestamp, nonce, deadline);

        // isSponsored should be false when wallet is forwarder
        vm.expectEmit(true, true, true, true);
        emit WalletAcknowledged(wallet, wallet, reportedChainId, incidentTimestamp, false);

        vm.prank(wallet);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);

        assertTrue(spoke.isPending(wallet));
    }

    /// @notice Acknowledgement fails with expired deadline
    function test_Acknowledge_RejectsExpiredDeadline() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp - 1; // Already expired
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__SignatureExpired.selector);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Acknowledgement fails with wrong nonce
    function test_Acknowledge_RejectsInvalidNonce() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 wrongNonce = 999;

        (uint8 v, bytes32 r, bytes32 s) =
            _signAck(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, wrongNonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidNonce.selector);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, wrongNonce, wallet, v, r, s);
    }

    /// @notice Acknowledgement fails with zero address owner
    function test_Acknowledge_RejectsZeroAddress() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidOwner.selector);
        spoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, 0, address(0), 27, bytes32(0), bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Full registration flow succeeds
    function test_Register_Success() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        // Get required fee
        uint256 fee = spoke.quoteRegistration(wallet);

        vm.expectEmit(true, false, false, true);
        emit RegistrationSentToHub(wallet, bytes32(0), HUB_CHAIN_ID); // messageId will be computed

        vm.prank(forwarder);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);

        // Verify acknowledgement cleaned up
        assertFalse(spoke.isPending(wallet));
        assertEq(spoke.nonces(wallet), 2); // Incremented again
    }

    /// @notice Registration fails before grace period
    function test_Register_FailsBeforeGracePeriod() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        // Don't skip to registration window

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__GracePeriodNotStarted.selector);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails after expiry
    function test_Register_FailsAfterExpiry() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);

        // Skip past expiry
        ISpokeRegistryV2.AcknowledgementData memory ack = spoke.getAcknowledgement(wallet);
        vm.roll(ack.expiryBlock);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__ForwarderExpired.selector);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails with wrong forwarder
    function test_Register_FailsWithWrongForwarder() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        address wrongForwarder = makeAddr("wrongForwarder");
        vm.deal(wrongForwarder, 10 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, wrongForwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        uint256 fee = spoke.quoteRegistration(wallet);

        vm.prank(wrongForwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InvalidForwarder.selector);
        spoke.registerLocal{ value: fee }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails with insufficient fee
    function test_Register_FailsWithInsufficientFee() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        _doAck(forwarder, reportedChainId, incidentTimestamp);
        _skipToRegistrationWindow();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = spoke.nonces(wallet);

        (uint8 v, bytes32 r, bytes32 s) =
            _signReg(walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__InsufficientFee.selector);
        spoke.registerLocal{ value: 0 }(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);
    }

    /// @notice Registration fails when hub not configured
    function test_Register_FailsWhenHubNotConfigured() public {
        // Deploy spoke with no hub configured
        SpokeRegistryV2 unconfiguredSpoke = new SpokeRegistryV2(
            owner,
            address(bridgeAdapter),
            address(feeManager),
            0, // No hub chain ID
            bytes32(0), // No hub inbox
            GRACE_BLOCKS,
            DEADLINE_BLOCKS,
            1
        );

        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = unconfiguredSpoke.nonces(wallet);

        // First do acknowledgement
        (uint8 v, bytes32 r, bytes32 s) = _signAckForSpoke(
            unconfiguredSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );

        vm.prank(forwarder);
        unconfiguredSpoke.acknowledgeLocal(reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s);

        // Skip to registration window
        ISpokeRegistryV2.AcknowledgementData memory ack = unconfiguredSpoke.getAcknowledgement(wallet);
        vm.roll(ack.startBlock);

        // Try to register
        nonce = unconfiguredSpoke.nonces(wallet);
        (v, r, s) = _signRegForSpoke(
            unconfiguredSpoke, walletPrivateKey, wallet, forwarder, reportedChainId, incidentTimestamp, nonce, deadline
        );

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistryV2.SpokeRegistryV2__HubNotConfigured.selector);
        unconfiguredSpoke.registerLocal{ value: 1 ether }(
            reportedChainId, incidentTimestamp, deadline, nonce, wallet, v, r, s
        );
    }

    // Helper for signing with different spoke contract
    function _signAckForSpoke(
        SpokeRegistryV2 _spoke,
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"),
                block.chainid,
                address(_spoke)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                ACK_TYPEHASH,
                keccak256(bytes(ACK_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return vm.sign(privateKey, digest);
    }

    function _signRegForSpoke(
        SpokeRegistryV2 _spoke,
        uint256 privateKey,
        address _wallet,
        address _forwarder,
        bytes32 reportedChainId,
        uint64 incidentTimestamp,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("StolenWalletRegistry"),
                keccak256("4"),
                block.chainid,
                address(_spoke)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                REG_TYPEHASH,
                keccak256(bytes(REG_STATEMENT)),
                _wallet,
                _forwarder,
                reportedChainId,
                incidentTimestamp,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        return vm.sign(privateKey, digest);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fee quote includes bridge and registration fees
    function test_QuoteFeeBreakdown() public view {
        ISpokeRegistryV2.FeeBreakdown memory fees = spoke.quoteFeeBreakdown(wallet);

        assertGt(fees.bridgeFee, 0);
        assertGt(fees.registrationFee, 0);
        assertEq(fees.total, fees.bridgeFee + fees.registrationFee);
        assertEq(fees.bridgeName, "Hyperlane");
    }

    /// @notice generateHashStruct returns valid data for signing
    function test_GenerateHashStruct() public {
        bytes32 reportedChainId = CAIP10.caip2Hash(uint64(1));
        uint64 incidentTimestamp = uint64(block.timestamp - 1 days);

        vm.prank(wallet);
        (uint256 deadline, bytes32 hashStruct) =
            spoke.generateHashStruct(reportedChainId, incidentTimestamp, forwarder, 1);

        assertGt(deadline, block.timestamp);
        assertTrue(hashStruct != bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Owner can update hub config
    function test_SetHubConfig() public {
        uint32 newHubChainId = 10; // Optimism
        bytes32 newHubInbox = bytes32(uint256(0xdead));

        spoke.setHubConfig(newHubChainId, newHubInbox);

        assertEq(spoke.hubChainId(), newHubChainId);
        assertEq(spoke.hubInbox(), newHubInbox);
    }

    /// @notice Non-owner cannot update hub config
    function test_SetHubConfig_OnlyOwner() public {
        address notOwner = makeAddr("notOwner");

        vm.prank(notOwner);
        vm.expectRevert();
        spoke.setHubConfig(10, bytes32(uint256(0xdead)));
    }
}
