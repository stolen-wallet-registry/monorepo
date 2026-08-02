// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TimingConfig
/// @author Stolen Wallet Registry Team
/// @notice Library for registration timing calculations
/// @dev Provides randomized grace period and deadline calculations.
///      Uses block.prevrandao for randomization (post-merge Ethereum).
///
/// TIMING BEHAVIOR:
/// - Grace period: Randomized delay before registration can begin
/// - Deadline: Randomized window to complete registration after grace period
/// - Block counts are configurable per-chain to maintain consistent UX
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHAIN-SPECIFIC CONFIGURATION — CALIBRATE TO `block.number`, NOT TO BLOCK TIME
/// ═══════════════════════════════════════════════════════════════════════════
/// These counts are compared against `block.number`. On most chains `block.number`
/// advances at the chain's own block rate, but NOT everywhere — see Arbitrum below.
/// Always calibrate against the rate at which `block.number` actually ticks.
///
/// | Chain          | `block.number` ticks at | Grace | Deadline | Result           |
/// |----------------|-------------------------|-------|----------|------------------|
/// | Anvil (local)  | 13s  (local L2 blocks)  | 2     | 50       | ~30s  / ~10 min  |
/// | Base/Optimism  | 2s   (L2 blocks)        | 60    | 300      | ~2 min / ~10 min |
/// | Ethereum L1    | 12s  (L1 blocks)        | 10    | 50       | ~2 min / ~10 min |
/// | Arbitrum       | ~12s (L1 blocks!)       | 10    | 50       | ~2 min / ~10 min |
///
/// ARBITRUM — VERIFIED EMPIRICALLY 2026-07-30 against Arbitrum One mainnet:
///   eth_blockNumber (RPC)      = 489,269,716   <- L2 block number
///   block.number in a contract =  25,645,219   <- L1 block number
///   ArbSys.arbBlockNumber()    = 489,269,728   <- L2 block number
/// `block.number` inside a contract on Arbitrum returns the **L1** block number,
/// which advances at ~12s, NOT the ~0.25s L2 rate. Arbitrum therefore uses the
/// SAME counts as Ethereum L1. The previous 480/2400 configuration assumed the L2
/// rate and produced a ~96 MINUTE grace period and an ~8 HOUR window.
/// Use `ArbSys.arbBlockNumber()` (precompile 0x64) if an L2-rate clock is ever needed.
///
/// SECURITY NOTES:
/// - Randomization widens the timing window an attacker must cover; it is defense in
///   depth, NOT the primary anti-phishing control. The primary control is that the
///   registration signature commits to a block hash that cannot exist until the grace
///   period has elapsed (see `WalletRegistry.register`).
/// - `block.prevrandao` is proposer-influenceable and is NOT cryptographically secure.
///   Nothing here may depend on it being unpredictable.
/// - The seed deliberately EXCLUDES `msg.sender`. Including it let whoever submitted
///   the acknowledgement grind candidate submitter addresses off-chain, for free, until
///   the seed produced a minimum grace period and a maximum registration window —
///   making "randomized" timing attacker-selected. Only values the submitter cannot
///   choose may enter the seed.
/// - RESIDUAL, ACCEPTED: the seed is now purely block-level, so every acknowledgement in a
///   block shares its offsets and a submitter still chooses WHICH block to land in. On
///   OP-stack L2s `prevrandao` is the L1 beacon value and holds for ~6 L2 blocks, while
///   `timestamp`/`number` are predictable one block ahead — so an attacker can simulate the
///   next block's offset and submit only when grace is minimal and the window maximal. The
///   cost is waiting, not gas. This is strictly better than the address grind it replaced
///   (which was free and instant), and it is tolerable ONLY because randomization is not the
///   control being relied on: `resolveWindowBlockHash` is. Do not reintroduce caller-chosen
///   entropy to "fix" this — that restores the worse attack. Removing block-level grind
///   entirely needs a commit-reveal or VRF, which is out of proportion to what the offsets buy.
library TimingConfig {
    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice The referenced block precedes the grace period (signature made too early)
    error TimingConfig__WindowBlockBeforeGracePeriod();

    /// @notice The referenced block is not yet mined, or is the current block
    error TimingConfig__WindowBlockNotMined();

    /// @notice The referenced block is outside the hash-availability window (re-sign needed)
    error TimingConfig__WindowBlockTooOld();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Maximum additional randomness for timestamps (in seconds)
    /// @dev 30 minutes to match frontend session storage duration
    uint256 internal constant TIMESTAMP_JITTER = 1800;

    /// @notice Maximum accepted lifetime of an EIP-712 signature, in seconds.
    /// @dev Bounds how long a harvested signature stays usable. Without an upper bound a
    ///      hostile frontend could set `deadline` to `type(uint256).max` and hold a valid
    ///      acknowledgement signature indefinitely, submitting it months later when the
    ///      victim has no memory or context of signing. Comfortably exceeds the ~30-60 min
    ///      `getSignatureDeadline()` the honest client requests, so it never binds in
    ///      normal use.
    uint256 internal constant MAX_SIGNATURE_LIFETIME = 2 hours;

    /// @notice How many blocks back `blockhash` remains available (EVM-wide constant).
    /// @dev Verified present on Arbitrum too (blockhash(n-255) resolves, n-260 returns zero).
    uint256 internal constant MAX_WINDOW_BLOCK_AGE = 256;

    // ═══════════════════════════════════════════════════════════════════════════
    // SIGNATURE FRESHNESS (anti-phishing)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Resolve the block hash a registration signature must commit to.
    /// @dev THE SINGLE SOURCE OF SIGNATURE FRESHNESS. Every registry routes through this,
    ///      so the underlying source can be changed per-chain in one place.
    ///
    ///      Requiring the signature to commit to `blockhash(windowBlock)` where
    ///      `windowBlock >= gracePeriodStart` makes the signature unproducible before the
    ///      grace period has elapsed: that block does not exist — and so has no hash —
    ///      at acknowledgement time. This is what makes the two victim interactions
    ///      genuinely separated in time rather than merely the two transactions.
    ///
    ///      CHAIN NOTE — Arbitrum: `block.number` here is the L1 block number and
    ///      `blockhash` is documented by Arbitrum as pseudo-random and NOT cryptographically
    ///      secure. It was verified (2026-07-30) that Arbitrum's value is NOT the real L1
    ///      block hash, so whether it is precomputable ahead of time is UNRESOLVED. If an
    ///      Arbitrum deployment is planned, resolve that first; if it turns out to be
    ///      predictable, switch this function to `ArbSys(0x64).arbBlockHash()` over
    ///      `arbBlockNumber()` (true L2 hashes, but only a ~64s availability window at L2
    ///      block rates, which needs a UX review for the P2P relay flow).
    ///
    /// @param windowBlock Block whose hash the signer committed to (unsigned calldata)
    /// @param gracePeriodStart Earliest block the signature may reference
    /// @return The block hash the signature must have committed to
    function resolveWindowBlockHash(uint256 windowBlock, uint256 gracePeriodStart) internal view returns (bytes32) {
        if (windowBlock < gracePeriodStart) revert TimingConfig__WindowBlockBeforeGracePeriod();
        if (windowBlock >= block.number) revert TimingConfig__WindowBlockNotMined();
        // Conservative by one block, deliberately. The EVM makes `blockhash` available for
        // `block.number - 256 <= x < block.number`, so an age of exactly 256 DOES still resolve;
        // this rejects it anyway. Erring inside the horizon rather than at it means the bound
        // stays correct on any chain that trims the window (Arbitrum's is not the L1 hash), and
        // it costs a signer one block out of 256. Do not "fix" this to `>` without re-checking
        // every target chain's blockhash semantics. Pinned by
        // `test_registerTransactions_acceptsWindowBlockAtMaxAge` (255 passes) and
        // `test_registerTransactions_revertsIfWindowBlockTooOld` (256 reverts).
        if (block.number - windowBlock >= MAX_WINDOW_BLOCK_AGE) revert TimingConfig__WindowBlockTooOld();

        bytes32 hash = blockhash(windowBlock);
        // Defensive: the bounds above should guarantee availability, but a chain with
        // non-standard blockhash semantics must fail loudly rather than accept bytes32(0),
        // which an attacker could otherwise supply for an unmined block.
        if (hash == bytes32(0)) revert TimingConfig__WindowBlockTooOld();
        return hash;
    }

    /// @notice Reject a signature deadline that is expired or unreasonably far in the future
    /// @dev THE SINGLE SOURCE OF THE ACCEPTED DEADLINE RANGE. Every registry entry point routes
    ///      through this rather than re-deriving `block.timestamp + MAX_SIGNATURE_LIFETIME` inline.
    ///
    ///      Call sites still branch on `deadline <= block.timestamp` afterwards, but only to
    ///      attribute blame between their two user-facing error selectors (`__DeadlineExpired`
    ///      vs `__DeadlineTooFarInFuture`, which the frontend maps to different messages). That
    ///      second comparison never decides whether the deadline is acceptable — this function
    ///      already did. Do NOT reintroduce the upper bound at a call site: eight copies of
    ///      the range is what this replaced.
    /// @param deadline Signature expiry timestamp, as signed
    /// @return True when the deadline is within the accepted range
    function isSignatureDeadlineValid(uint256 deadline) internal view returns (bool) {
        return deadline > block.timestamp && deadline <= block.timestamp + MAX_SIGNATURE_LIFETIME;
    }

    /// @notice Domain separators so each derived offset gets an independent seed.
    /// @dev Previously grace and deadline both hashed the same salt, so a single seed
    ///      drove both offsets and they were perfectly correlated — one grind produced
    ///      minimum grace AND maximum window simultaneously. Distinct domains break that.
    bytes32 private constant DOMAIN_GRACE = keccak256("swr.timing.grace");
    bytes32 private constant DOMAIN_DEADLINE = keccak256("swr.timing.deadline");
    bytes32 private constant DOMAIN_SIGNATURE = keccak256("swr.timing.signature");

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Calculate randomized block when grace period ends
    /// @dev Registration can begin after this block
    /// @param graceBlocks Base number of blocks for grace period (chain-specific)
    /// @return Block number when grace period ends
    function getGracePeriodEndBlock(uint256 graceBlocks) internal view returns (uint256) {
        return block.number + _randomOffset(DOMAIN_GRACE, graceBlocks) + graceBlocks;
    }

    /// @notice Calculate randomized block when registration window closes
    /// @dev Registration must complete before this block
    /// @param deadlineBlocks Base number of blocks for deadline window (chain-specific)
    /// @return Block number when registration window expires
    function getDeadlineBlock(uint256 deadlineBlocks) internal view returns (uint256) {
        return block.number + _randomOffset(DOMAIN_DEADLINE, deadlineBlocks) + deadlineBlocks;
    }

    /// @notice Calculate signature deadline timestamp
    /// @dev Used for EIP-712 signature expiry validation. Chain-agnostic (uses timestamp).
    /// @return Timestamp when signature expires
    function getSignatureDeadline() internal view returns (uint256) {
        return block.timestamp + _randomOffset(DOMAIN_SIGNATURE, TIMESTAMP_JITTER) + TIMESTAMP_JITTER;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Derive a bounded offset from block entropy, per domain
    /// @dev Seeded ONLY from values the caller cannot choose (`prevrandao`, `timestamp`,
    ///      `number`) plus a domain separator. See the library-level note on why
    ///      `msg.sender` must never be included.
    /// @param domain Domain separator making each offset independent of the others
    /// @param maxOffset Exclusive upper bound
    /// @return Value in range [0, maxOffset)
    function _randomOffset(bytes32 domain, uint256 maxOffset) private view returns (uint256) {
        if (maxOffset == 0) return 0;
        bytes32 seed = keccak256(abi.encode(domain, block.prevrandao, block.timestamp, block.number));
        return uint256(seed) % maxOffset;
    }
}
