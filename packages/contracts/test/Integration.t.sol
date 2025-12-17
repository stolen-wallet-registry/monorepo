// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { RegistryHub } from "../src/RegistryHub.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { StolenWalletRegistry } from "../src/registries/StolenWalletRegistry.sol";
import { IRegistryHub } from "../src/interfaces/IRegistryHub.sol";
import { IStolenWalletRegistry } from "../src/interfaces/IStolenWalletRegistry.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

/// @title IntegrationTest
/// @notice End-to-end tests for the full registry system
contract IntegrationTest is Test {
    RegistryHub public hub;
    FeeManager public feeManager;
    StolenWalletRegistry public walletRegistry;
    MockAggregator public mockOracle;

    address public deployer;
    address public victim;
    address public forwarder;
    uint256 internal victimPrivateKey;

    // EIP-712 constants
    bytes32 private constant ACKNOWLEDGEMENT_TYPEHASH =
        keccak256("AcknowledgementOfRegistry(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant REGISTRATION_TYPEHASH =
        keccak256("Registration(address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        deployer = makeAddr("deployer");
        forwarder = makeAddr("forwarder");

        // Create victim with known private key for signing
        victimPrivateKey = 0xA11CE;
        victim = vm.addr(victimPrivateKey);

        vm.deal(deployer, 10 ether);
        vm.deal(victim, 10 ether);
        vm.deal(forwarder, 10 ether);

        // Deploy full system
        vm.startPrank(deployer);

        // 1. Deploy mock oracle
        mockOracle = new MockAggregator(300_000_000_000); // $3000 ETH

        // 2. Deploy contracts
        walletRegistry = new StolenWalletRegistry();
        feeManager = new FeeManager(deployer, address(mockOracle));
        hub = new RegistryHub(deployer, address(feeManager), address(walletRegistry));

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPE_HASH, keccak256("StolenWalletRegistry"), keccak256("4"), block.chainid, address(walletRegistry)
            )
        );
    }

    function _signAcknowledgement(
        uint256 privateKey,
        address _owner,
        address _forwarder,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(ACKNOWLEDGEMENT_TYPEHASH, _owner, _forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _signRegistration(uint256 privateKey, address _owner, address _forwarder, uint256 nonce, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(REGISTRATION_TYPEHASH, _owner, _forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _doAcknowledgement() internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(victim);

        (uint8 v, bytes32 r, bytes32 s) = _signAcknowledgement(victimPrivateKey, victim, forwarder, nonce, deadline);

        vm.prank(forwarder);
        walletRegistry.acknowledge(deadline, nonce, victim, v, r, s);
    }

    function _skipToRegistrationWindow() internal {
        (,, uint256 startBlock,,,) = walletRegistry.getDeadlines(victim);
        vm.roll(startBlock + 1);
    }

    function _doRegistration() internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(victim);

        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(victimPrivateKey, victim, forwarder, nonce, deadline);

        vm.prank(forwarder);
        walletRegistry.register(deadline, nonce, victim, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FULL REGISTRATION FLOW TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_FullRegistrationFlow() public {
        // Initial state
        assertFalse(hub.isWalletRegistered(victim));
        assertFalse(hub.isWalletPending(victim));

        // Phase 1: Acknowledgement
        _doAcknowledgement();

        // Verify pending state via hub
        assertFalse(hub.isWalletRegistered(victim));
        assertTrue(hub.isWalletPending(victim));

        // Wait for grace period
        _skipToRegistrationWindow();

        // Phase 2: Registration
        _doRegistration();

        // Verify registered state via hub
        assertTrue(hub.isWalletRegistered(victim));
        assertFalse(hub.isWalletPending(victim));
    }

    function test_QueryAfterRegistration() public {
        // Complete full flow
        _doAcknowledgement();
        _skipToRegistrationWindow();
        _doRegistration();

        // Query through hub
        assertTrue(hub.isWalletRegistered(victim));
        assertFalse(hub.isWalletPending(victim));

        // Query through registry directly
        assertTrue(walletRegistry.isRegistered(victim));
        assertFalse(walletRegistry.isPending(victim));

        // Get registration data
        IStolenWalletRegistry.RegistrationData memory data = walletRegistry.getRegistration(victim);
        assertEq(data.registeredBy, forwarder);
        assertTrue(data.isSponsored);
        assertGt(data.registeredAt, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE INTEGRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_FeeCalculation_Integration() public view {
        // Verify fee flows through hub → feeManager → oracle
        uint256 hubFee = hub.currentFeeWei();
        uint256 feeManagerFee = feeManager.currentFeeWei();

        assertEq(hubFee, feeManagerFee);

        // With $3000 ETH and $5 fee: ~0.00166 ETH
        uint256 expectedFee = (uint256(500) * 1e18) / uint256(300_000);
        assertEq(hubFee, expectedFee);
    }

    function test_FeeChanges_ReflectInHub() public {
        uint256 initialFee = hub.currentFeeWei();

        // Change ETH price
        mockOracle.setPrice(400_000_000_000); // $4000 ETH

        uint256 newFee = hub.currentFeeWei();
        assertLt(newFee, initialFee); // Fee should be lower with higher ETH price

        // Change base fee
        vm.prank(deployer);
        feeManager.setBaseFee(1000); // $10

        uint256 doubledFee = hub.currentFeeWei();
        assertGt(doubledFee, newFee);
    }

    function test_FreeRegistrations_WhenNoFeeManager() public {
        // Deploy hub without fee manager
        vm.prank(deployer);
        RegistryHub freeHub = new RegistryHub(deployer, address(0), address(walletRegistry));

        assertEq(freeHub.currentFeeWei(), 0);
    }

    function test_FreeRegistrations_WhenZeroBaseFee() public {
        vm.prank(deployer);
        feeManager.setBaseFee(0);

        assertEq(hub.currentFeeWei(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SYSTEM STATE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SystemDeployment_AllContractsLinked() public view {
        // Hub has correct references
        assertEq(hub.feeManager(), address(feeManager));
        assertEq(hub.getRegistry(hub.STOLEN_WALLET()), address(walletRegistry));

        // Fee manager has correct owner
        assertEq(feeManager.owner(), deployer);
        assertEq(feeManager.priceFeed(), address(mockOracle));

        // Hub has correct owner
        assertEq(hub.owner(), deployer);
    }

    function test_OwnershipTransfer_FullSystem() public {
        address newOwner = makeAddr("newOwner");

        // Transfer hub ownership
        vm.prank(deployer);
        hub.transferOwnership(newOwner);

        vm.prank(newOwner);
        hub.acceptOwnership();
        assertEq(hub.owner(), newOwner);

        // Transfer fee manager ownership
        vm.prank(deployer);
        feeManager.transferOwnership(newOwner);

        vm.prank(newOwner);
        feeManager.acceptOwnership();
        assertEq(feeManager.owner(), newOwner);

        // New owner can manage both
        vm.startPrank(newOwner);
        hub.setPaused(true);
        feeManager.setBaseFee(1000);
        vm.stopPrank();

        assertTrue(hub.paused());
        assertEq(feeManager.baseFeeUsdCents(), 1000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EDGE CASE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_MultipleWalletRegistrations() public {
        // Register first wallet
        _doAcknowledgement();
        _skipToRegistrationWindow();
        _doRegistration();

        assertTrue(hub.isWalletRegistered(victim));

        // Register second wallet
        uint256 victim2PrivateKey = 0xB0B;
        address victim2 = vm.addr(victim2PrivateKey);
        vm.deal(victim2, 1 ether);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = walletRegistry.nonces(victim2);

        bytes32 structHash = keccak256(abi.encode(ACKNOWLEDGEMENT_TYPEHASH, victim2, forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(victim2PrivateKey, digest);

        vm.prank(forwarder);
        walletRegistry.acknowledge(deadline, nonce, victim2, v, r, s);

        // Skip to registration window for victim2
        (,, uint256 startBlock,,,) = walletRegistry.getDeadlines(victim2);
        vm.roll(startBlock + 1);

        // Complete registration for victim2
        deadline = block.timestamp + 1 hours;
        nonce = walletRegistry.nonces(victim2);

        structHash = keccak256(abi.encode(REGISTRATION_TYPEHASH, victim2, forwarder, nonce, deadline));
        digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), structHash));
        (v, r, s) = vm.sign(victim2PrivateKey, digest);

        vm.prank(forwarder);
        walletRegistry.register(deadline, nonce, victim2, v, r, s);

        // Both should be registered
        assertTrue(hub.isWalletRegistered(victim));
        assertTrue(hub.isWalletRegistered(victim2));
    }

    function test_OracleFailure_SystemStillWorks() public {
        // Make oracle fail
        mockOracle.setShouldRevert(true);

        // Fee calculation should fallback to manual price
        uint256 fee = hub.currentFeeWei();
        uint256 expectedFee = (uint256(500) * 1e18) / uint256(300_000); // Uses fallback $3000
        assertEq(fee, expectedFee);

        // Registration should still work
        _doAcknowledgement();
        assertTrue(hub.isWalletPending(victim));
    }

    function test_PriceVolatility_FeeUpdates() public {
        // Price doubles
        mockOracle.setPrice(600_000_000_000); // $6000 ETH
        uint256 feeAt6k = hub.currentFeeWei();

        // Price halves
        mockOracle.setPrice(300_000_000_000); // $3000 ETH
        uint256 feeAt3k = hub.currentFeeWei();

        // Fee at $6k should be half of fee at $3k
        assertEq(feeAt6k * 2, feeAt3k);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GAS BENCHMARK TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Gas_HubQueryPassthrough() public view {
        // Measure gas for hub passthrough queries
        uint256 gasBefore = gasleft();
        hub.isWalletRegistered(victim);
        uint256 gasUsed = gasBefore - gasleft();

        // Hub passthrough to registry with external call overhead
        console2.log("Gas for isWalletRegistered via hub:", gasUsed);
        assertLt(gasUsed, 20_000);
    }

    function test_Gas_CurrentFeeWei() public view {
        uint256 gasBefore = gasleft();
        hub.currentFeeWei();
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("Gas for currentFeeWei via hub:", gasUsed);
        // Includes hub → feeManager → oracle chain (multiple external calls)
        assertLt(gasUsed, 35_000);
    }
}
