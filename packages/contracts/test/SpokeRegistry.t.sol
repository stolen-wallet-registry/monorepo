// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SpokeRegistry } from "../src/spoke/SpokeRegistry.sol";
import { ISpokeRegistry } from "../src/interfaces/ISpokeRegistry.sol";
import { HyperlaneAdapter } from "../src/crosschain/adapters/HyperlaneAdapter.sol";
import { FeeManager } from "../src/FeeManager.sol";
import { CrossChainMessage } from "../src/libraries/CrossChainMessage.sol";
import { MockMailbox } from "./mocks/MockMailbox.sol";
import { MockInterchainGasPaymaster } from "./mocks/MockInterchainGasPaymaster.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

contract SpokeRegistryTest is Test {
    SpokeRegistry registry;
    HyperlaneAdapter adapter;
    MockMailbox mailbox;
    MockInterchainGasPaymaster gasPaymaster;
    FeeManager feeManager;
    MockAggregator oracle;

    address owner;
    address victim;
    address forwarder;
    uint256 victimPk;

    uint32 constant HUB_DOMAIN = 84_532;
    uint32 constant SPOKE_CHAIN_ID = 11_155_420;

    uint256 internal constant GRACE_BLOCKS = 10;
    uint256 internal constant DEADLINE_BLOCKS = 50;

    bytes32 private constant ACK_TYPEHASH = keccak256(
        "AcknowledgementOfRegistry(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant REG_TYPEHASH =
        keccak256("Registration(string statement,address owner,address forwarder,uint256 nonce,uint256 deadline)");
    bytes32 private constant TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // Statement constants (must match contract)
    string private constant ACK_STATEMENT =
        "This signature acknowledges that the signing wallet is being reported as stolen to the Stolen Wallet Registry.";
    string private constant REG_STATEMENT =
        "This signature confirms permanent registration of the signing wallet in the Stolen Wallet Registry. This action is irreversible.";

    function setUp() public {
        vm.chainId(SPOKE_CHAIN_ID);

        owner = makeAddr("owner");
        forwarder = makeAddr("forwarder");
        victimPk = 0xA11CE;
        victim = vm.addr(victimPk);
        vm.deal(forwarder, 10 ether);

        mailbox = new MockMailbox(SPOKE_CHAIN_ID);
        gasPaymaster = new MockInterchainGasPaymaster();

        vm.startPrank(owner);
        adapter = new HyperlaneAdapter(owner, address(mailbox), address(gasPaymaster));
        adapter.setDomainSupport(HUB_DOMAIN, true);
        oracle = new MockAggregator(300_000_000_000);
        feeManager = new FeeManager(owner, address(oracle));
        registry = new SpokeRegistry(
            owner,
            address(adapter),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );
        vm.stopPrank();
    }

    function _domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(
            abi.encode(TYPE_HASH, keccak256("StolenWalletRegistry"), keccak256("4"), block.chainid, verifyingContract)
        );
    }

    function _sign(
        bytes32 typeHash,
        address ownerAddr,
        address forwarderAddr,
        uint256 nonce,
        uint256 deadline,
        address targetRegistry
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        // Determine which statement to use based on type hash
        bytes32 statementHash =
            typeHash == ACK_TYPEHASH ? keccak256(bytes(ACK_STATEMENT)) : keccak256(bytes(REG_STATEMENT));
        bytes32 structHash = keccak256(abi.encode(typeHash, statementHash, ownerAddr, forwarderAddr, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(targetRegistry), structHash));
        (v, r, s) = vm.sign(victimPk, digest);
    }

    // Convenience overload for the default registry
    function _sign(bytes32 typeHash, address ownerAddr, address forwarderAddr, uint256 nonce, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        return _sign(typeHash, ownerAddr, forwarderAddr, nonce, deadline, address(registry));
    }

    function _acknowledge(address forwarderAddr) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        (uint8 v, bytes32 r, bytes32 s) = _sign(ACK_TYPEHASH, victim, forwarderAddr, nonce, deadline);

        vm.prank(forwarderAddr);
        registry.acknowledgeLocal(deadline, nonce, victim, v, r, s);
    }

    function _skipToWindow(address ownerAddr) internal {
        (,, uint256 startBlock,,,) = registry.getDeadlines(ownerAddr);
        vm.roll(startBlock + 1);
    }

    // Ownable should reject a zero owner at deployment.
    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new SpokeRegistry(
            address(0),
            address(adapter),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );
    }

    // Constructor should reject a zero bridge adapter.
    function test_Constructor_RevertsOnZeroBridgeAdapter() public {
        vm.expectRevert(SpokeRegistry.SpokeRegistry__ZeroAddress.selector);
        new SpokeRegistry(
            owner,
            address(0),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            GRACE_BLOCKS,
            DEADLINE_BLOCKS
        );
    }

    // Constructor should reject invalid timing parameters.
    function test_Constructor_RevertsOnInvalidTiming() public {
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidTimingConfig.selector);
        new SpokeRegistry(
            owner,
            address(adapter),
            address(feeManager),
            HUB_DOMAIN,
            CrossChainMessage.addressToBytes32(makeAddr("hubInbox")),
            0,
            DEADLINE_BLOCKS
        );
    }

    // Acknowledgement should reject a zero owner address.
    function test_Acknowledge_InvalidOwner_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(address(0));
        (uint8 v, bytes32 r, bytes32 s) = _sign(ACK_TYPEHASH, address(0), forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidOwner.selector);
        registry.acknowledgeLocal(deadline, nonce, address(0), v, r, s);
    }

    // Acknowledgement should reject an incorrect nonce.
    function test_Acknowledge_InvalidNonce_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 999;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ACK_TYPEHASH, victim, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidNonce.selector);
        registry.acknowledgeLocal(deadline, nonce, victim, v, r, s);
    }

    // Acknowledgement should reject signatures not from the owner.
    // Uses correct struct format with statement hash to ensure we're testing ONLY wrong signer.
    function test_Acknowledge_InvalidSigner_Reverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        bytes32 structHash =
            keccak256(abi.encode(ACK_TYPEHASH, keccak256(bytes(ACK_STATEMENT)), victim, forwarder, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(registry)), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, digest);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidSigner.selector);
        registry.acknowledgeLocal(deadline, nonce, victim, v, r, s);
    }

    // Acknowledgement should reject expired signatures.
    function test_Acknowledge_SignatureExpired_Reverts() public {
        uint256 deadline = block.timestamp - 1;
        uint256 nonce = registry.nonces(victim);
        (uint8 v, bytes32 r, bytes32 s) = _sign(ACK_TYPEHASH, victim, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__SignatureExpired.selector);
        registry.acknowledgeLocal(deadline, nonce, victim, v, r, s);
    }

    // Registration depends on a configured hub inbox; without it, messages
    // cannot be routed cross-chain, so the call must revert early.
    function test_Register_HubNotConfigured_Reverts() public {
        SpokeRegistry noHub = new SpokeRegistry(
            owner, address(adapter), address(feeManager), HUB_DOMAIN, bytes32(0), GRACE_BLOCKS, DEADLINE_BLOCKS
        );

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = noHub.nonces(victim);
        // Use parameterized _sign to target the noHub registry instance
        (uint8 v, bytes32 r, bytes32 s) = _sign(REG_TYPEHASH, victim, forwarder, nonce, deadline, address(noHub));

        vm.prank(forwarder);
        vm.expectRevert(SpokeRegistry.SpokeRegistry__HubNotConfigured.selector);
        noHub.registerLocal(deadline, nonce, victim, v, r, s);
    }

    // Registration must be submitted by the trusted forwarder.
    function test_Register_InvalidForwarder_Reverts() public {
        _acknowledge(forwarder);
        _skipToWindow(victim);

        address wrongForwarder = makeAddr("wrongForwarder");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        (uint8 v, bytes32 r, bytes32 s) = _sign(REG_TYPEHASH, victim, wrongForwarder, nonce, deadline);

        vm.prank(wrongForwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InvalidForwarder.selector);
        registry.registerLocal(deadline, nonce, victim, v, r, s);
    }

    // Registration should fail before grace period starts.
    function test_Register_GracePeriodNotStarted_Reverts() public {
        _acknowledge(forwarder);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        (uint8 v, bytes32 r, bytes32 s) = _sign(REG_TYPEHASH, victim, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__GracePeriodNotStarted.selector);
        registry.registerLocal(deadline, nonce, victim, v, r, s);
    }

    // Registration must respect the timing window: after expiry, the forwarder
    // is no longer trusted, so the call must revert.
    function test_Register_ExpiredForwarder_Reverts() public {
        _acknowledge(forwarder);

        (, uint256 expiryBlock,,,,) = registry.getDeadlines(victim);
        vm.roll(expiryBlock + 1);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        (uint8 v, bytes32 r, bytes32 s) = _sign(REG_TYPEHASH, victim, forwarder, nonce, deadline);

        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__ForwarderExpired.selector);
        registry.registerLocal(deadline, nonce, victim, v, r, s);
    }

    // Fee enforcement: registration must include bridge + protocol fees.
    // This protects relayers from subsidizing underpayments.
    function test_Register_InsufficientFee_Reverts() public {
        _acknowledge(forwarder);
        _skipToWindow(victim);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        (uint8 v, bytes32 r, bytes32 s) = _sign(REG_TYPEHASH, victim, forwarder, nonce, deadline);

        uint256 fee = registry.quoteRegistration(victim);
        assertGt(fee, 0);
        vm.prank(forwarder);
        vm.expectRevert(ISpokeRegistry.SpokeRegistry__InsufficientFee.selector);
        registry.registerLocal{ value: fee - 1 }(deadline, nonce, victim, v, r, s);
    }

    // Hub config should reject chainId set with zero inbox.
    function test_SetHubConfig_InvalidCombination_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(SpokeRegistry.SpokeRegistry__InvalidHubConfig.selector);
        registry.setHubConfig(HUB_DOMAIN, bytes32(0));
    }

    // Withdraw should reject a zero recipient.
    function test_WithdrawFees_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(SpokeRegistry.SpokeRegistry__ZeroAddress.selector);
        registry.withdrawFees(address(0), 1);
    }

    // Withdraw should revert if recipient rejects ETH.
    function test_WithdrawFees_RejectsReceiver_Reverts() public {
        RejectingReceiver rejector = new RejectingReceiver();
        vm.deal(address(registry), 1 ether);

        vm.prank(owner);
        vm.expectRevert(SpokeRegistry.SpokeRegistry__WithdrawalFailed.selector);
        registry.withdrawFees(address(rejector), 0.5 ether);
    }

    // Fee breakdown should include both bridge and registration fees.
    function test_QuoteFeeBreakdown_IncludesRegistrationFee() public view {
        ISpokeRegistry.FeeBreakdown memory breakdown = registry.quoteFeeBreakdown(victim);

        assertGt(breakdown.bridgeFee, 0);
        assertGt(breakdown.registrationFee, 0);
        assertEq(breakdown.total, breakdown.bridgeFee + breakdown.registrationFee);
        // Use adapter's bridgeName() to avoid brittleness if name changes
        assertEq(breakdown.bridgeName, adapter.bridgeName());
    }

    // Refund safety: if a payer can't receive the excess refund, the call
    // must revert to avoid unexpected loss of funds.
    function test_RefundFailure_Reverts() public {
        RefundRejector rejector = new RefundRejector(registry);
        address refundForwarder = address(rejector);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(victim);
        // Include statement hash per EIP-712
        bytes32 structHash = keccak256(
            abi.encode(ACK_TYPEHASH, keccak256(bytes(ACK_STATEMENT)), victim, refundForwarder, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(registry)), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(victimPk, digest);

        rejector.acknowledge(deadline, nonce, victim, v, r, s);

        _skipToWindow(victim);

        nonce = registry.nonces(victim);
        deadline = block.timestamp + 1 hours;
        structHash = keccak256(
            abi.encode(REG_TYPEHASH, keccak256(bytes(REG_STATEMENT)), victim, refundForwarder, nonce, deadline)
        );
        digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(address(registry)), structHash));
        (v, r, s) = vm.sign(victimPk, digest);

        uint256 fee = registry.quoteRegistration(victim);
        uint256 excess = 0.1 ether;
        vm.deal(refundForwarder, fee + excess);

        vm.expectRevert(SpokeRegistry.SpokeRegistry__RefundFailed.selector);
        rejector.register{ value: fee + excess }(deadline, nonce, victim, v, r, s);
    }
}

contract RefundRejector {
    SpokeRegistry public registry;

    constructor(SpokeRegistry _registry) {
        registry = _registry;
    }

    function acknowledge(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external {
        registry.acknowledgeLocal(deadline, nonce, owner, v, r, s);
    }

    function register(uint256 deadline, uint256 nonce, address owner, uint8 v, bytes32 r, bytes32 s) external payable {
        registry.registerLocal{ value: msg.value }(deadline, nonce, owner, v, r, s);
    }

    receive() external payable {
        revert("refund rejected");
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert("no");
    }
}
