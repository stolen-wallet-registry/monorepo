// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRegistryHub
/// @author Stolen Wallet Registry Team
/// @notice Interface for the main Registry Hub that coordinates subregistries
/// @dev The RegistryHub serves as the primary entry point for the fraud registry system.
///      It delegates to specialized subregistries while providing unified query access.
///      Designed with Ownable2Step for safe DAO ownership transfer in the future.
interface IRegistryHub {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when attempting to operate while the hub is paused
    error Hub__Paused();

    /// @notice Thrown when attempting to interact with an unregistered subregistry
    error Hub__InvalidRegistry();

    /// @notice Thrown when the provided fee is insufficient
    error Hub__InsufficientFee();

    /// @notice Thrown when a fee withdrawal fails
    error Hub__WithdrawalFailed();

    /// @notice Thrown when caller is not authorized CrossChainInbox
    error Hub__UnauthorizedInbox();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when the hub is paused or unpaused
    /// @param paused True if hub is now paused, false if unpaused
    event HubPaused(bool paused);

    /// @notice Emitted when a subregistry is registered or updated
    /// @param registryType Identifier for the registry type
    /// @param registry Address of the subregistry contract
    event RegistryUpdated(bytes32 indexed registryType, address indexed registry);

    /// @notice Emitted when fees are withdrawn from the hub
    /// @param to Recipient address
    /// @param amount Amount withdrawn in wei
    event FeesWithdrawn(address indexed to, uint256 amount);

    /// @notice Emitted when the fee manager is updated
    /// @param feeManager New fee manager address
    event FeeManagerUpdated(address indexed feeManager);

    /// @notice Emitted when the cross-chain inbox is updated
    /// @param inbox New CrossChainInbox address
    event CrossChainInboxUpdated(address indexed inbox);

    /// @notice Emitted when a wallet is registered via cross-chain message
    /// @param wallet The wallet address registered as stolen
    /// @param sourceChainId EIP-155 chain ID where registration originated
    /// @param messageId Bridge message identifier for tracking
    event CrossChainRegistration(address indexed wallet, uint32 indexed sourceChainId, bytes32 messageId);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Registry type identifier for stolen wallets
    /// @dev keccak256("STOLEN_WALLET_REGISTRY")
    function stolenWalletRegistryType() external pure returns (bytes32);

    /// @notice Registry type identifier for fraudulent contracts (future)
    /// @dev keccak256("FRAUDULENT_CONTRACT_REGISTRY")
    function fraudulentContractRegistryType() external pure returns (bytes32);

    /// @notice Registry type identifier for stolen transactions (future)
    /// @dev keccak256("STOLEN_TRANSACTION_REGISTRY")
    function stolenTransactionRegistryType() external pure returns (bytes32);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Query Passthroughs
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a wallet is registered as stolen
    /// @dev Delegates to StolenWalletRegistry.isRegistered()
    /// @param wallet The address to query
    /// @return True if the wallet is registered as stolen
    function isWalletRegistered(address wallet) external view returns (bool);

    /// @notice Check if a wallet has a pending acknowledgement
    /// @dev Delegates to StolenWalletRegistry.isPending()
    /// @param wallet The address to query
    /// @return True if there is a pending acknowledgement
    function isWalletPending(address wallet) external view returns (bool);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS - Hub State
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if the hub is currently paused
    /// @return True if the hub is paused
    function paused() external view returns (bool);

    /// @notice Get the address of a subregistry by type
    /// @param registryType The registry type identifier
    /// @return The address of the subregistry (address(0) if not set)
    function getRegistry(bytes32 registryType) external view returns (address);

    /// @notice Get the fee manager contract address
    /// @return The fee manager address
    function feeManager() external view returns (address);

    /// @notice Get the cross-chain inbox contract address
    /// @return The CrossChainInbox address
    function crossChainInbox() external view returns (address);

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register a wallet from a spoke chain via cross-chain message
    /// @dev Only callable by the CrossChainInbox contract.
    ///      Routes the registration to StolenWalletRegistry.registerFromHub().
    /// @param wallet The wallet address to register as stolen
    /// @param sourceChainId EIP-155 chain ID where registration originated
    /// @param isSponsored True if a third party paid gas
    /// @param bridgeId Which bridge delivered the message
    /// @param crossChainMessageId Bridge message ID for explorer linking
    function registerFromSpoke(
        address wallet,
        uint32 sourceChainId,
        bool isSponsored,
        uint8 bridgeId,
        bytes32 crossChainMessageId
    ) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Pause or unpause the hub
    /// @dev Only callable by owner. When paused, new registrations are blocked.
    /// @param _paused True to pause, false to unpause
    function setPaused(bool _paused) external;

    /// @notice Register or update a subregistry address
    /// @dev Only callable by owner. Set to address(0) to unregister a subregistry.
    ///      Implementations SHOULD validate the registry address implements ISubRegistry
    ///      when setting a non-zero address.
    /// @param registryType The registry type identifier (use constants like stolenWalletRegistryType())
    /// @param registry The subregistry contract address (address(0) to unregister)
    function setRegistry(bytes32 registryType, address registry) external;

    /// @notice Update the fee manager contract
    /// @dev Only callable by owner. Implementations MUST validate _feeManager != address(0)
    ///      to prevent disabling fee collection. Emits FeeManagerUpdated event.
    /// @param _feeManager The new fee manager address (must be non-zero)
    function setFeeManager(address _feeManager) external;

    /// @notice Update the cross-chain inbox contract
    /// @dev Only callable by owner. Set to address(0) to disable cross-chain registrations.
    /// @param _inbox The new CrossChainInbox address
    function setCrossChainInbox(address _inbox) external;

    /// @notice Withdraw accumulated fees to a specified address
    /// @dev Only callable by owner. Implementations MUST validate:
    ///      - `to` != address(0) to prevent burning fees
    ///      - `amount` > 0 to prevent empty withdrawals
    ///      - `amount` <= address(this).balance to ensure sufficient funds
    /// @param to The recipient address (must be non-zero)
    /// @param amount The amount to withdraw in wei (must be > 0 and <= balance)
    function withdrawFees(address to, uint256 amount) external;
}
