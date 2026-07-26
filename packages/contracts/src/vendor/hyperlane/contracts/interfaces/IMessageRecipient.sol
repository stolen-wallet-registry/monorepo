// SPDX-License-Identifier: MIT OR Apache-2.0
// VENDORED FROM hyperlane-xyz/hyperlane-monorepo @ 1a31d0425f060339e1c14980f552c976d408ec91
//   (@hyperlane-xyz/core v11.3.1) — solidity/contracts/interfaces/IMessageRecipient.sol
// Do not edit. See src/vendor/hyperlane/README.md for why this is vendored and
// how to refresh it.
pragma solidity >=0.6.11;

interface IMessageRecipient {
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _message) external payable;
}
