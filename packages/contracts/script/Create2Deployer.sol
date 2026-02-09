// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Create2Deployer
/// @notice Helper library for deterministic contract deployment via the canonical CREATE2 factory.
/// @dev Used only in deploy scripts — NOT deployed on-chain.
///      The canonical factory (Nick Johnson's keyless deployment) exists at the same address
///      on all EVM chains. It takes `salt ++ initcode` as calldata and executes CREATE2.
library Create2Deployer {
    /// @notice Canonical CREATE2 factory (deployed on all EVM chains)
    /// @dev Deployed via pre-signed tx — same address everywhere.
    ///      See: https://github.com/Arachnid/deterministic-deployment-proxy
    address internal constant FACTORY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Deploy a contract via CREATE2 through the canonical factory
    /// @param salt  Deterministic salt (use Salts library for consistency)
    /// @param initcode  type(Contract).creationCode ++ abi.encode(constructorArgs)
    /// @return addr  The deployed contract address
    function deploy(bytes32 salt, bytes memory initcode) internal returns (address addr) {
        // The factory expects: salt (32 bytes) ++ initcode
        (bool success,) = FACTORY.call(abi.encodePacked(salt, initcode));
        require(success, "Create2Deployer: factory call failed");

        // Compute the deterministic address from inputs rather than parsing
        // the factory's return data (avoids ambiguity on return format)
        addr = predict(salt, initcode);
        require(addr.code.length > 0, "Create2Deployer: no code at predicted address");
    }

    /// @notice Predict the CREATE2 address without deploying
    /// @param salt  The same salt that will be passed to deploy()
    /// @param initcode  The same initcode that will be passed to deploy()
    /// @return The address where the contract will be (or was) deployed
    function predict(bytes32 salt, bytes memory initcode) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), FACTORY, salt, keccak256(initcode))))));
    }
}
