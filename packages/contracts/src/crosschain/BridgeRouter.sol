// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IBridgeAdapter } from "../interfaces/IBridgeAdapter.sol";
import { CrossChainMessage } from "../libraries/CrossChainMessage.sol";

/// @title BridgeRouter
/// @author Stolen Wallet Registry Team
/// @notice Routes cross-chain messages through configured bridge adapters
/// @dev Maintains adapter registry and default routes per destination chain.
///      Supports multiple bridge adapters (Hyperlane, CCIP, Wormhole) with fallback options.
contract BridgeRouter is Ownable2Step {
    using CrossChainMessage for CrossChainMessage.RegistrationPayload;

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Route configuration for a destination chain
    /// @param adapter Default bridge adapter address
    /// @param recipientInbox CrossChainInbox address on destination (bytes32 for cross-VM)
    /// @param enabled Whether routing to this destination is enabled
    struct RouteConfig {
        address adapter;
        bytes32 recipientInbox;
        bool enabled;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mapping of bridge ID to adapter address
    /// @dev BridgeId enum: 1=Hyperlane, 2=CCIP, 3=Wormhole
    mapping(uint8 => address) public adapters;

    /// @notice Route configuration per destination chain (Hyperlane domain ID)
    mapping(uint32 => RouteConfig) public routes;

    /// @notice Hub chain Hyperlane domain ID (Base Sepolia = 84532)
    uint32 public hubDomain;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when route is not configured or disabled
    error BridgeRouter__RouteNotConfigured();

    /// @notice Thrown when adapter is not configured
    error BridgeRouter__AdapterNotConfigured();

    /// @notice Thrown when insufficient fee provided
    error BridgeRouter__InsufficientFee();

    /// @notice Thrown when refund transfer fails
    error BridgeRouter__RefundFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a message is routed cross-chain
    event MessageRouted(
        bytes32 indexed messageId,
        uint32 indexed destinationDomain,
        address indexed adapter,
        address wallet,
        uint256 fee
    );

    /// @notice Emitted when adapter is registered or updated
    event AdapterUpdated(uint8 indexed bridgeId, address indexed adapter);

    /// @notice Emitted when route configuration is updated
    event RouteUpdated(uint32 indexed domain, address adapter, bytes32 recipientInbox, bool enabled);

    /// @notice Emitted when hub domain is updated
    event HubDomainUpdated(uint32 indexed oldDomain, uint32 indexed newDomain);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @param _owner Contract owner
    /// @param _hubDomain Hub chain Hyperlane domain ID
    constructor(address _owner, uint32 _hubDomain) Ownable(_owner) {
        hubDomain = _hubDomain;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Send a registration message to the hub chain
    /// @dev Called by SpokeRegistry after successful two-phase registration
    /// @param payload Registration data to send cross-chain
    /// @return messageId Bridge message identifier for tracking
    function sendToHub(CrossChainMessage.RegistrationPayload memory payload)
        external
        payable
        returns (bytes32 messageId)
    {
        RouteConfig memory route = routes[hubDomain];
        if (!route.enabled || route.adapter == address(0)) {
            revert BridgeRouter__RouteNotConfigured();
        }

        bytes memory encodedPayload = payload.encodeRegistration();

        // Get fee quote and validate
        uint256 fee = IBridgeAdapter(route.adapter).quoteMessage(hubDomain, encodedPayload);
        if (msg.value < fee) {
            revert BridgeRouter__InsufficientFee();
        }

        // Send via configured adapter
        messageId =
            IBridgeAdapter(route.adapter).sendMessage{ value: fee }(hubDomain, route.recipientInbox, encodedPayload);

        emit MessageRouted(messageId, hubDomain, route.adapter, payload.wallet, fee);

        // Refund excess
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert BridgeRouter__RefundFailed();
        }
    }

    /// @notice Send a message to a specific destination using a specific adapter
    /// @dev For advanced use cases - direct adapter selection
    /// @param bridgeId Bridge adapter to use (1=Hyperlane, 2=CCIP, 3=Wormhole)
    /// @param destinationDomain Target chain domain ID
    /// @param recipient Recipient address on destination (bytes32)
    /// @param payload Encoded message data
    /// @return messageId Bridge message identifier
    function sendMessage(uint8 bridgeId, uint32 destinationDomain, bytes32 recipient, bytes calldata payload)
        external
        payable
        returns (bytes32 messageId)
    {
        address adapter = adapters[bridgeId];
        if (adapter == address(0)) {
            revert BridgeRouter__AdapterNotConfigured();
        }

        uint256 fee = IBridgeAdapter(adapter).quoteMessage(destinationDomain, payload);
        if (msg.value < fee) {
            revert BridgeRouter__InsufficientFee();
        }

        messageId = IBridgeAdapter(adapter).sendMessage{ value: fee }(destinationDomain, recipient, payload);

        emit MessageRouted(messageId, destinationDomain, adapter, address(0), fee);

        // Refund excess
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool success,) = msg.sender.call{ value: excess }("");
            if (!success) revert BridgeRouter__RefundFailed();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Quote fee for sending registration to hub
    /// @param payload Registration payload to quote
    /// @return fee Required fee in native token
    function quoteHubFee(CrossChainMessage.RegistrationPayload memory payload) external view returns (uint256 fee) {
        RouteConfig memory route = routes[hubDomain];
        if (!route.enabled || route.adapter == address(0)) {
            revert BridgeRouter__RouteNotConfigured();
        }

        bytes memory encodedPayload = payload.encodeRegistration();
        return IBridgeAdapter(route.adapter).quoteMessage(hubDomain, encodedPayload);
    }

    /// @notice Check if a route is configured and enabled
    /// @param domain Destination domain ID
    /// @return True if route is ready for use
    function isRouteEnabled(uint32 domain) external view returns (bool) {
        RouteConfig memory route = routes[domain];
        return route.enabled && route.adapter != address(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register or update a bridge adapter
    /// @param bridgeId Bridge identifier (1=Hyperlane, 2=CCIP, 3=Wormhole)
    /// @param adapter Adapter contract address (address(0) to remove)
    function setAdapter(uint8 bridgeId, address adapter) external onlyOwner {
        adapters[bridgeId] = adapter;
        emit AdapterUpdated(bridgeId, adapter);
    }

    /// @notice Configure route for a destination chain
    /// @param domain Destination domain ID
    /// @param adapter Bridge adapter to use
    /// @param recipientInbox CrossChainInbox address on destination
    /// @param enabled Whether route is enabled
    function setRoute(uint32 domain, address adapter, bytes32 recipientInbox, bool enabled) external onlyOwner {
        routes[domain] = RouteConfig({ adapter: adapter, recipientInbox: recipientInbox, enabled: enabled });
        emit RouteUpdated(domain, adapter, recipientInbox, enabled);
    }

    /// @notice Update hub domain
    /// @param _hubDomain New hub chain domain ID
    function setHubDomain(uint32 _hubDomain) external onlyOwner {
        uint32 oldDomain = hubDomain;
        hubDomain = _hubDomain;
        emit HubDomainUpdated(oldDomain, _hubDomain);
    }
}
