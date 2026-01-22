// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFraudulentContractRegistry
/// @author Stolen Wallet Registry Team
/// @notice Interface for the operator-only fraudulent contract registry
/// @dev Only DAO-approved operators can submit batches. No individual submissions.
interface IFraudulentContractRegistry {
    // ═══════════════════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════════════════

    struct ContractBatch {
        bytes32 merkleRoot; // Root of contract addresses + chainIds
        address operator; // Operator who submitted
        bytes32 reportedChainId; // Primary chain for this batch (CAIP-2)
        uint64 registeredAt; // Block number when registered
        uint32 contractCount; // Number of contracts in batch
        bool invalidated; // Soft delete flag (entire batch)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when an operator registers a batch of fraudulent contracts
    /// @param batchId Unique identifier for this batch
    /// @param merkleRoot Root of the Merkle tree
    /// @param operator Address of the operator who submitted
    /// @param reportedChainId Primary chain for this batch
    /// @param contractCount Number of contracts in the batch
    /// @param contractAddresses Array of contract addresses
    /// @param chainIds Array of chain IDs for each contract
    event ContractBatchRegistered(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        address indexed operator,
        bytes32 reportedChainId,
        uint32 contractCount,
        address[] contractAddresses,
        bytes32[] chainIds
    );

    /// @notice Emitted when DAO invalidates an entire batch
    /// @param batchId The batch that was invalidated
    /// @param invalidatedBy Address that performed the invalidation
    event BatchInvalidated(bytes32 indexed batchId, address indexed invalidatedBy);

    /// @notice Emitted when DAO invalidates a specific entry
    /// @param entryHash The entry hash that was invalidated
    /// @param invalidatedBy Address that performed the invalidation
    event EntryInvalidated(bytes32 indexed entryHash, address indexed invalidatedBy);

    /// @notice Emitted when DAO reinstates a previously invalidated entry
    /// @param entryHash The entry hash that was reinstated
    /// @param reinstatedBy Address that performed the reinstatement
    event EntryReinstated(bytes32 indexed entryHash, address indexed reinstatedBy);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error FraudulentContractRegistry__NotApprovedOperator();
    error FraudulentContractRegistry__InvalidOperatorRegistry();
    error FraudulentContractRegistry__MissingRegistryHub();
    error FraudulentContractRegistry__InvalidMerkleRoot();
    error FraudulentContractRegistry__InvalidChainId();
    error FraudulentContractRegistry__InvalidContractCount();
    error FraudulentContractRegistry__ArrayLengthMismatch();
    error FraudulentContractRegistry__MerkleRootMismatch();
    error FraudulentContractRegistry__AlreadyRegistered();
    error FraudulentContractRegistry__InsufficientFee();
    error FraudulentContractRegistry__FeeForwardFailed();
    error FraudulentContractRegistry__BatchNotFound();
    error FraudulentContractRegistry__AlreadyInvalidated();
    error FraudulentContractRegistry__NotInvalidated();
    error FraudulentContractRegistry__InvalidContractAddress();
    error FraudulentContractRegistry__InvalidChainIdEntry();
    error FraudulentContractRegistry__BatchSizeExceedsLimit();
    error FraudulentContractRegistry__UnexpectedEthWithFeesDisabled();

    // ═══════════════════════════════════════════════════════════════════════════
    // WRITE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Register a batch of fraudulent contracts (operator only, single-phase)
    /// @param merkleRoot Root of Merkle tree built from contract addresses + chainIds
    /// @param reportedChainId Primary chain for this batch (CAIP-2 format)
    /// @param contractAddresses Array of fraudulent contract addresses
    /// @param chainIds Array of chain IDs (CAIP-2 bytes32) for each contract
    /// @dev Requires msg.sender to be an approved operator with CONTRACT_REGISTRY capability
    function registerBatch(
        bytes32 merkleRoot,
        bytes32 reportedChainId,
        address[] calldata contractAddresses,
        bytes32[] calldata chainIds
    ) external payable;

    /// @notice Invalidate an entire batch (DAO only)
    /// @param batchId The batch ID to invalidate
    function invalidateBatch(bytes32 batchId) external;

    /// @notice Invalidate a specific entry (DAO only)
    /// @param entryHash OZ StandardMerkleTree leaf hash of (contractAddress, chainId)
    function invalidateEntry(bytes32 entryHash) external;

    /// @notice Reinstate a previously invalidated entry (DAO only)
    /// @param entryHash The entry hash to reinstate
    function reinstateEntry(bytes32 entryHash) external;

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if a batch exists and is not invalidated
    /// @param batchId The batch ID to check
    /// @return True if batch exists and is valid
    function isBatchRegistered(bytes32 batchId) external view returns (bool);

    /// @notice Verify a contract is in a specific batch using merkle proof
    /// @param contractAddress The contract address to verify
    /// @param chainId The chain ID (CAIP-2 bytes32)
    /// @param batchId The batch to check against
    /// @param merkleProof The merkle proof for verification
    /// @return True if contract is in the batch and neither batch nor entry is invalidated
    function verifyContract(address contractAddress, bytes32 chainId, bytes32 batchId, bytes32[] calldata merkleProof)
        external
        view
        returns (bool);

    /// @notice Get batch data
    /// @param batchId The batch ID to query
    /// @return The ContractBatch struct
    function getBatch(bytes32 batchId) external view returns (ContractBatch memory);

    /// @notice Check if a specific entry is invalidated
    /// @param entryHash The entry hash to check
    /// @return True if entry is invalidated
    function isEntryInvalidated(bytes32 entryHash) external view returns (bool);

    /// @notice Compute batch ID from parameters
    /// @param merkleRoot The merkle root
    /// @param operator The operator address
    /// @param reportedChainId The primary chain ID
    /// @dev Batch ID = keccak256(abi.encodePacked(merkleRoot, operator, reportedChainId))
    /// @return The computed batch ID
    function computeBatchId(bytes32 merkleRoot, address operator, bytes32 reportedChainId)
        external
        pure
        returns (bytes32);

    /// @notice Compute entry hash from contract address and chain ID
    /// @param contractAddress The contract address
    /// @param chainId The chain ID
    /// @dev Entry hash = keccak256(abi.encodePacked(contractAddress, chainId))
    ///      Used as leaf values in Merkle tree construction.
    /// @return The entry hash
    function computeEntryHash(address contractAddress, bytes32 chainId) external pure returns (bytes32);

    /// @notice Quote the registration fee
    /// @return Fee in wei
    function quoteRegistration() external view returns (uint256);

    /// @notice Get the operator registry address
    /// @return The operator registry contract address
    function operatorRegistry() external view returns (address);

    /// @notice Get the fee manager address
    /// @return The fee manager contract address
    function feeManager() external view returns (address);

    /// @notice Get the registry hub address
    /// @return The registry hub contract address
    function registryHub() external view returns (address);
}
