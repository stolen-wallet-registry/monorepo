// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC5192 } from "./interfaces/IERC5192.sol";
import { ITranslationRegistry } from "./interfaces/ITranslationRegistry.sol";

/// @title BaseSoulbound
/// @notice Shared logic for soulbound token contracts
/// @dev Implements ERC-5192 using OZ 5.x _update pattern for transfer blocking
/// @author Stolen Wallet Registry Team
///
/// This contract uses the OpenZeppelin 5.x pattern for implementing soulbound tokens.
/// Instead of overriding 5 separate transfer functions, we override the single _update()
/// function that all transfers route through.
///
/// Reference: https://forum.openzeppelin.com/t/soulbound-nft-migration-from-v4-9-to-v5-0/38931
abstract contract BaseSoulbound is ERC721, IERC5192, Ownable2Step {
    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Translation registry for multilingual SVG content
    ITranslationRegistry public immutable translations;

    /// @notice Fee collector address for withdrawals
    address public immutable feeCollector;

    /// @notice Domain to display in SVG (e.g., "stolenwallet.xyz")
    string public domain;

    /// @dev Counter for token IDs
    uint256 internal _tokenIdCounter;

    /// @notice Addresses authorized to call mintTo (e.g., SoulboundReceiver for cross-chain mints)
    mapping(address => bool) public authorizedMinters;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when attempting to transfer a soulbound token
    error NonTransferrable();

    /// @notice Thrown when fee withdrawal fails
    error WithdrawFailed();

    /// @notice Thrown when fee collector address is zero
    error InvalidFeeCollector();

    /// @notice Thrown when translations address is zero
    error InvalidTranslations();

    /// @notice Thrown when caller is not an authorized minter
    error NotAuthorizedMinter();

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when domain is updated
    /// @param oldDomain The previous domain value
    /// @param newDomain The new domain value
    event DomainUpdated(string oldDomain, string newDomain);

    /// @notice Emitted when an authorized minter is added or removed
    /// @param minter The minter address
    /// @param authorized True if authorized, false if revoked
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the soulbound token contract
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param _translations Address of the TranslationRegistry contract
    /// @param _feeCollector Address to receive withdrawn fees
    /// @param _domain Domain to display in SVG (e.g., "stolenwallet.xyz")
    constructor(
        string memory name_,
        string memory symbol_,
        address _translations,
        address _feeCollector,
        string memory _domain
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        if (_translations == address(0)) revert InvalidTranslations();
        if (_feeCollector == address(0)) revert InvalidFeeCollector();

        translations = ITranslationRegistry(_translations);
        feeCollector = _feeCollector;
        domain = _domain;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-5192: SOULBOUND
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice All tokens are permanently locked (soulbound)
    /// @param tokenId The token to check
    /// @return Always returns true for valid tokens
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId); // Reverts if token doesn't exist
        return true; // Always locked
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCK ALL TRANSFERS (OZ 5.x PATTERN)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Override _update to block all transfers after minting
    ///
    /// This single override handles ALL transfer paths:
    /// - transferFrom
    /// - safeTransferFrom (both overloads)
    /// - Any future transfer mechanism that routes through _update
    ///
    /// We only allow minting (from == address(0)).
    /// All other transfers are blocked with NonTransferrable error.
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0))
        // Block all transfers (from != address(0))
        if (from != address(0)) {
            revert NonTransferrable();
        }

        return super._update(to, tokenId, auth);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE WITHDRAWAL
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Withdraw accumulated fees to FeeCollector
    /// @dev Only owner can trigger withdrawal
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success,) = feeCollector.call{ value: balance }("");
        if (!success) revert WithdrawFailed();
    }

    /// @notice Update the domain displayed in SVG
    /// @dev Only owner can update domain
    /// @param _domain New domain string (e.g., "stolenwallet.xyz")
    function setDomain(string calldata _domain) external onlyOwner {
        string memory oldDomain = domain;
        domain = _domain;
        emit DomainUpdated(oldDomain, _domain);
    }

    /// @notice Add or remove an authorized minter (for cross-chain mints)
    /// @dev Only owner can manage authorized minters
    /// @param minter Address to authorize/deauthorize
    /// @param authorized True to authorize, false to revoke
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        authorizedMinters[minter] = authorized;
        emit AuthorizedMinterUpdated(minter, authorized);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a new token and emit the Locked event
    /// @param to The recipient address
    /// @return tokenId The newly minted token ID
    function _mintAndLock(address to) internal returns (uint256) {
        uint256 tokenId = ++_tokenIdCounter;
        _safeMint(to, tokenId);
        emit Locked(tokenId); // ERC-5192: signal that token is soulbound
        return tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-165 INTERFACE SUPPORT
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if contract supports an interface
    /// @param interfaceId The interface ID to check
    /// @return True if interface is supported
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @notice Get total number of tokens minted
    /// @return The total supply
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
