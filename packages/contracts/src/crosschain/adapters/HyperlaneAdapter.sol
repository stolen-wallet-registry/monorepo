// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IBridgeAdapter } from "../../interfaces/IBridgeAdapter.sol";
import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import { IInterchainGasPaymaster } from "@hyperlane-xyz/core/contracts/interfaces/IInterchainGasPaymaster.sol";

/// @title HyperlaneAdapter
/// @author Stolen Wallet Registry Team
/// @notice IBridgeAdapter implementation for Hyperlane messaging protocol
/// @dev Wraps IMailbox.dispatch() and IInterchainGasPaymaster for cross-chain messaging.
///      Uses two-step dispatch + payForGas pattern for Hyperlane v3.
contract HyperlaneAdapter is IBridgeAdapter, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Default gas amount for destination chain execution
    /// @dev ~200k should be sufficient for registration + storage + event emission
    uint256 public constant DEFAULT_GAS_AMOUNT = 200_000;

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Hyperlane Mailbox contract
    IMailbox public immutable mailbox;

    /// @notice Hyperlane Interchain Gas Paymaster
    IInterchainGasPaymaster public immutable gasPaymaster;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mapping of supported destination Hyperlane domain IDs
    mapping(uint32 => bool) public supportedDomains;

    /// @notice Custom gas amount per destination domain (0 = use DEFAULT_GAS_AMOUNT)
    mapping(uint32 => uint256) public gasAmounts;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when refund transfer fails
    error HyperlaneAdapter__RefundFailed();

    /// @notice Thrown when a zero address is provided for a required parameter
    error HyperlaneAdapter__ZeroAddress();

    /// @notice Thrown when too many domains are provided in batch operation
    error HyperlaneAdapter__TooManyDomains();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a domain is added or removed from supported list
    event DomainSupportUpdated(uint32 indexed domain, bool supported);

    /// @notice Emitted when gas amount is updated for a domain
    event GasAmountUpdated(uint32 indexed domain, uint256 gasAmount);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @param _owner Contract owner
    /// @param _mailbox Hyperlane Mailbox address on this chain
    /// @param _gasPaymaster Hyperlane InterchainGasPaymaster address
    constructor(address _owner, address _mailbox, address _gasPaymaster) Ownable(_owner) {
        if (_mailbox == address(0)) revert HyperlaneAdapter__ZeroAddress();
        if (_gasPaymaster == address(0)) revert HyperlaneAdapter__ZeroAddress();
        mailbox = IMailbox(_mailbox);
        gasPaymaster = IInterchainGasPaymaster(_gasPaymaster);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // IBridgeAdapter IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IBridgeAdapter
    function sendMessage(uint32 destinationChain, bytes32 recipient, bytes calldata payload)
        external
        payable
        returns (bytes32 messageId)
    {
        if (!supportedDomains[destinationChain]) {
            revert BridgeAdapter__UnsupportedChain();
        }

        // Step 1: Dispatch message via Hyperlane Mailbox
        messageId = mailbox.dispatch(destinationChain, recipient, payload);

        // Step 2: Pay for gas on destination chain
        uint256 gasAmount = gasAmounts[destinationChain];
        if (gasAmount == 0) gasAmount = DEFAULT_GAS_AMOUNT;

        uint256 gasQuote = gasPaymaster.quoteGasPayment(destinationChain, gasAmount);
        if (msg.value < gasQuote) {
            revert BridgeAdapter__InsufficientFee();
        }

        gasPaymaster.payForGas{ value: gasQuote }(messageId, destinationChain, gasAmount, msg.sender);

        // Refund excess
        uint256 excess = msg.value - gasQuote;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert HyperlaneAdapter__RefundFailed();
        }

        emit MessageSent(messageId, destinationChain, recipient, payload);
    }

    /// @inheritdoc IBridgeAdapter
    function quoteMessage(uint32 destinationChain, bytes calldata) external view returns (uint256 fee) {
        if (!supportedDomains[destinationChain]) {
            revert BridgeAdapter__UnsupportedChain();
        }

        uint256 gasAmount = gasAmounts[destinationChain];
        if (gasAmount == 0) gasAmount = DEFAULT_GAS_AMOUNT;

        return gasPaymaster.quoteGasPayment(destinationChain, gasAmount);
    }

    /// @inheritdoc IBridgeAdapter
    function supportsChain(uint32 chainId) external view returns (bool) {
        return supportedDomains[chainId];
    }

    /// @inheritdoc IBridgeAdapter
    function bridgeName() external pure returns (string memory) {
        return "Hyperlane";
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Add or remove a supported destination domain
    /// @param domain Hyperlane domain ID
    /// @param supported True to enable, false to disable
    function setDomainSupport(uint32 domain, bool supported) external onlyOwner {
        supportedDomains[domain] = supported;
        emit DomainSupportUpdated(domain, supported);
    }

    /// @notice Set custom gas amount for a destination domain
    /// @param domain Hyperlane domain ID
    /// @param gasAmount Gas amount (0 = use DEFAULT_GAS_AMOUNT)
    function setGasAmount(uint32 domain, uint256 gasAmount) external onlyOwner {
        gasAmounts[domain] = gasAmount;
        emit GasAmountUpdated(domain, gasAmount);
    }

    /// @notice Batch add supported domains
    /// @dev Limited to 100 domains per call to prevent DoS via gas exhaustion
    /// @param domains Array of Hyperlane domain IDs to enable (max 100)
    function addDomains(uint32[] calldata domains) external onlyOwner {
        if (domains.length > 100) revert HyperlaneAdapter__TooManyDomains();
        for (uint256 i = 0; i < domains.length; i++) {
            supportedDomains[domains[i]] = true;
            emit DomainSupportUpdated(domains[i], true);
        }
    }
}
