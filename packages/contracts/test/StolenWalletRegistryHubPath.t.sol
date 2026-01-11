// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";

contract StolenWalletRegistryHubPathTest is Test {
    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ACK_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant REG_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");

    function test_Constructor_InvalidFeeConfig_Reverts() public {
        vm.expectRevert(IStolenWalletRegistry.InvalidFeeConfig.selector);
        new StolenWalletRegistry(makeAddr("feeManager"), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
    }

    function test_Constructor_InvalidTiming_Reverts() public {
        vm.expectRevert(IStolenWalletRegistry.InvalidTimingConfig.selector);
        new StolenWalletRegistry(address(0), address(0), 0, DEADLINE_BLOCKS);
    }

    function test_RegisterFromHub_Unauthorized_Reverts() public {
        StolenWalletRegistry registry =
            new StolenWalletRegistry(address(0), makeAddr("hub"), GRACE_BLOCKS, DEADLINE_BLOCKS);

        vm.expectRevert(IStolenWalletRegistry.UnauthorizedCaller.selector);
        registry.registerFromHub(makeAddr("wallet"), 1, false, 1, bytes32(0));
    }

    function test_RegisterFromHub_InvalidOwner_Reverts() public {
        address hub = makeAddr("hub");
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), hub, GRACE_BLOCKS, DEADLINE_BLOCKS);

        vm.prank(hub);
        vm.expectRevert(IStolenWalletRegistry.InvalidOwner.selector);
        registry.registerFromHub(address(0), 1, false, 1, bytes32(0));
    }

    function test_RegisterFromHub_InvalidChainId_Reverts() public {
        address hub = makeAddr("hub");
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), hub, GRACE_BLOCKS, DEADLINE_BLOCKS);

        vm.prank(hub);
        vm.expectRevert(IStolenWalletRegistry.InvalidChainId.selector);
        registry.registerFromHub(makeAddr("wallet"), 0, false, 1, bytes32(0));
    }

    function test_RegisterFromHub_InvalidBridgeId_Reverts() public {
        address hub = makeAddr("hub");
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), hub, GRACE_BLOCKS, DEADLINE_BLOCKS);

        vm.prank(hub);
        vm.expectRevert(IStolenWalletRegistry.InvalidBridgeId.selector);
        registry.registerFromHub(
            makeAddr("wallet"), 1, false, uint8(IStolenWalletRegistry.BridgeId.WORMHOLE) + 1, bytes32(0)
        );
    }

    function test_RegisterFromHub_AlreadyRegistered_Reverts() public {
        address hub = makeAddr("hub");
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), hub, GRACE_BLOCKS, DEADLINE_BLOCKS);
        address wallet = makeAddr("wallet");

        vm.prank(hub);
        registry.registerFromHub(wallet, 1, false, 1, bytes32(0));

        vm.prank(hub);
        vm.expectRevert(IStolenWalletRegistry.AlreadyRegistered.selector);
        registry.registerFromHub(wallet, 1, false, 1, bytes32(0));
    }

    function test_RegisterFromHub_Success() public {
        address hub = makeAddr("hub");
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), hub, GRACE_BLOCKS, DEADLINE_BLOCKS);
        address wallet = makeAddr("wallet");

        vm.prank(hub);
        registry.registerFromHub(wallet, 1, true, uint8(IStolenWalletRegistry.BridgeId.HYPERLANE), bytes32("msg"));

        IStolenWalletRegistry.RegistrationData memory data = registry.getRegistration(wallet);
        assertEq(data.sourceChainId, 1);
        assertEq(data.bridgeId, uint8(IStolenWalletRegistry.BridgeId.HYPERLANE));
        assertTrue(data.isSponsored);
    }

    function test_QuoteRegistration_NoFeeManager_ReturnsZero() public {
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);
        assertEq(registry.quoteRegistration(makeAddr("wallet")), 0);
    }

    function test_QuoteRegistration_WithFeeManager_ReturnsFee() public {
        MockAggregator oracle = new MockAggregator(300_000_000_000);
        FeeManager feeManager = new FeeManager(makeAddr("owner"), address(oracle));
        StolenWalletRegistry registry =
            new StolenWalletRegistry(address(feeManager), makeAddr("hub"), GRACE_BLOCKS, DEADLINE_BLOCKS);

        assertEq(registry.quoteRegistration(makeAddr("wallet")), feeManager.currentFeeWei());
    }

    function test_GetDeadlines_NoAcknowledgement_ReturnsExpired() public {
        StolenWalletRegistry registry = new StolenWalletRegistry(address(0), address(0), GRACE_BLOCKS, DEADLINE_BLOCKS);

        (
            uint256 currentBlock,
            uint256 expiryBlock,
            uint256 startBlock,
            uint256 graceStartsAt,
            uint256 timeLeft,
            bool isExpired
        ) = registry.getDeadlines(makeAddr("wallet"));

        assertEq(currentBlock, block.number);
        assertEq(expiryBlock, 0);
        assertEq(startBlock, 0);
        assertEq(graceStartsAt, 0);
        assertEq(timeLeft, 0);
        assertTrue(isExpired);
    }

    function test_Register_FeeForwardFailure_Reverts() public {
        RejectingReceiver rejectingHub = new RejectingReceiver();
        MockAggregator oracle = new MockAggregator(300_000_000_000);
        FeeManager feeManager = new FeeManager(makeAddr("owner"), address(oracle));
        StolenWalletRegistry registry =
            new StolenWalletRegistry(address(feeManager), address(rejectingHub), GRACE_BLOCKS, DEADLINE_BLOCKS);

        uint256 ownerPk = 0xA11CE;
        address owner = vm.addr(ownerPk);
        address forwarder = makeAddr("forwarder");

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(owner);
        (uint8 v, bytes32 r, bytes32 s) = _signAck(ownerPk, owner, forwarder, nonce, deadline, registry);

        vm.prank(forwarder);
        registry.acknowledge(deadline, nonce, owner, v, r, s);

        (,, uint256 startBlock,,,) = registry.getDeadlines(owner);
        vm.roll(startBlock + 1);

        nonce = registry.nonces(owner);
        (v, r, s) = _signReg(ownerPk, owner, forwarder, nonce, deadline, registry);

        uint256 fee = feeManager.currentFeeWei();
        assertGt(fee, 0);
        vm.deal(forwarder, fee);
        vm.prank(forwarder);
        vm.expectRevert(IStolenWalletRegistry.FeeForwardFailed.selector);
        registry.register{ value: fee }(deadline, nonce, owner, v, r, s);
    }

    function _domainSeparator(StolenWalletRegistry registry) internal view returns (bytes32) {
        return keccak256(
            abi.encode(TYPE_HASH, keccak256("StolenWalletRegistry"), keccak256("4"), block.chainid, address(registry))
        );
    }

    function _signAck(
        uint256 ownerPk,
        address owner,
        address forwarder,
        uint256 nonce,
        uint256 deadline,
        StolenWalletRegistry registry
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(ACK_TYPEHASH, owner, forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(registry), structHash));
        (v, r, s) = vm.sign(ownerPk, digest);
    }

    function _signReg(
        uint256 ownerPk,
        address owner,
        address forwarder,
        uint256 nonce,
        uint256 deadline,
        StolenWalletRegistry registry
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(REG_TYPEHASH, owner, forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(registry), structHash));
        (v, r, s) = vm.sign(ownerPk, digest);
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert("no");
    }
}
