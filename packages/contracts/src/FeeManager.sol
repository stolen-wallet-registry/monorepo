// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TimelockOwnable } from "./libraries/TimelockOwnable.sol";
import { AggregatorV3Interface } from "./interfaces/chainlink/AggregatorV3Interface.sol";
import { IFeeManager } from "./interfaces/IFeeManager.sol";

/// @title FeeManager
/// @author Stolen Wallet Registry Team
/// @notice Manages USD-denominated fees with Chainlink ETH/USD price feed and manual fallback
/// @dev Uses Chainlink for live pricing, falls back to stored price if oracle is stale/unavailable.
///      Supports opportunistic sync to keep fallback price reasonably fresh.
///
///      Inherits {TimelockOwnable}, not plain Ownable2Step. Every setter here is an economic
///      trust boundary on the critical path of registration: `fallbackEthPriceUsdCents = 1`
///      together with a large `baseFeeUsdCents` makes `currentFeeWei()` exceed any balance, so
///      every fee-collecting registration reverts `Fee__Insufficient`. That lands on PHASE TWO of
///      the two-phase flow, so victims who have already acknowledged watch their window expire
///      while `register` is unpayable — and both registries hold `feeManager` as `immutable`, so
///      recovery would otherwise require redeploying the registries. A one-transaction owner call
///      must not be able to do that; after `completeSetup()` these changes take the 2-day
///      propose → activate path.
///
///      The single carve-out is `setPriceFeed(address(0))`, which stays immediate — see the note
///      on that function.
contract FeeManager is IFeeManager, TimelockOwnable {
    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Upper bound on {stalePriceThreshold}
    /// @dev Without a cap the owner can set the threshold to `type(uint256).max`, which makes
    ///      every answer "fresh" forever and turns off staleness detection entirely. 7 days is far
    ///      beyond any legitimate ETH/USD heartbeat (Chainlink's is measured in hours), so it
    ///      constrains the abuse without constraining operations.
    uint256 public constant MAX_STALE_PRICE_THRESHOLD = 7 days;

    /// @notice Floor for the configurable price bounds, in USD cents
    /// @dev The bounds themselves are owner-settable, so they need their own bounds — otherwise
    ///      "clamp the oracle" is just a second lever with the same reach as the first.
    uint256 public constant MIN_PRICE_BOUND = 100; // $1.00

    /// @notice Ceiling for the configurable price bounds, in USD cents
    uint256 public constant MAX_PRICE_BOUND = 100_000_000; // $1,000,000.00

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Base fee in USD cents (500 = $5.00)
    uint256 public baseFeeUsdCents = 500;

    /// @notice Flat protocol fee per operator batch, in USD cents. Default: 0 (free).
    /// @dev Operator batches are FREE by design.
    ///
    ///      Rationale (see PRPs/operator-fee-removal.md and the operator economics docs for
    ///      the worked figures):
    ///
    ///      - A flat per-batch fee scales with the NUMBER OF BATCHES, not with data volume.
    ///        Large operator datasets require many batch transactions, so the protocol fee
    ///        comes to dominate the actual gas cost by orders of magnitude — enough that
    ///        submitting at scale stops being rational.
    ///      - The fee buys no security here. DAO approval is the trust mechanism for
    ///        operators: they are vetted entities with on-chain identities and reputational
    ///        stake. The individual registration fee still exists and still matters, because
    ///        it deters anonymous sybil spam — a threat operators do not present.
    ///      - Charging for data contribution works against the network effect the registry
    ///        depends on.
    ///
    ///      The fee mechanism is retained (not deleted) so the DAO can enable it later via
    ///      {setOperatorBatchFee} without a redeployment.
    uint256 public operatorBatchFeeUsdCents = 0;

    /// @notice Fallback ETH price in USD cents (300000 = $3,000.00)
    /// @dev Used when Chainlink is unavailable, stale, or not configured
    uint256 public fallbackEthPriceUsdCents = 300_000;

    /// @notice Chainlink price feed interface
    /// @dev address(0) = manual-only mode (no oracle)
    AggregatorV3Interface private _priceFeed;

    /// @notice Maximum age of Chainlink data before falling back to manual price
    /// @dev Default: 14400 seconds (4 hours) - lenient to handle oracle delays
    uint256 public stalePriceThreshold = 14_400;

    /// @notice Timestamp of last opportunistic fallback sync
    uint256 public lastFallbackSync;

    /// @notice Interval between opportunistic fallback syncs
    /// @dev Default: 1 day - keeps fallback reasonably fresh without extra cost
    uint256 public fallbackSyncInterval = 1 days;

    /// @notice Lowest ETH price, in USD cents, that will be accepted from the oracle
    /// @dev Default: $50.00. See {_withinBounds} for why this exists.
    uint256 public minEthPriceUsdCents = 5000;

    /// @notice Highest ETH price, in USD cents, that will be accepted from the oracle
    /// @dev Default: $50,000.00. See {_withinBounds} for why this exists.
    uint256 public maxEthPriceUsdCents = 5_000_000;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS (not in IFeeManager — additions local to this implementation)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when the proposed price bounds are inverted or outside the hard limits
    error Fee__InvalidBounds();

    /// @notice Thrown when the proposed staleness threshold exceeds MAX_STALE_PRICE_THRESHOLD
    error Fee__InvalidThreshold();

    /// @notice Thrown when an oracle answer is well-formed and fresh but outside the sanity bounds
    error Fee__PriceOutOfBounds();

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS (not in IFeeManager — additions local to this implementation)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when the oracle sanity bounds change
    /// @param minUsdCents New lower bound in USD cents
    /// @param maxUsdCents New upper bound in USD cents
    event PriceBoundsUpdated(uint256 minUsdCents, uint256 maxUsdCents);

    /// @notice Emitted when a fresh, positive oracle answer is rejected for being out of bounds
    /// @dev Deliberately loud. A feed that trips this is either broken or manipulated, and the
    ///      contract silently degrading to the fallback price is exactly the kind of thing that
    ///      goes unnoticed until the fallback itself is months stale.
    /// @param rejectedUsdCents The answer that was rejected, in USD cents
    event OraclePriceRejected(uint256 rejectedUsdCents);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initializes the fee manager with optional Chainlink price feed
    /// @param _owner Contract owner (DAO or deployer)
    /// @param priceFeedAddress Chainlink ETH/USD feed address (address(0) for manual-only mode)
    constructor(address _owner, address priceFeedAddress) Ownable(_owner) {
        if (priceFeedAddress != address(0)) {
            _priceFeed = AggregatorV3Interface(priceFeedAddress);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRICE RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Attempts to convert a Chainlink price to USD cents based on feed decimals.
    /// @notice Assumes standard Chainlink ETH/USD feeds (8 decimals, price ~3×10¹¹)
    ///         For exotic feeds with high decimals and small values, result may truncate to 0
    ///
    ///      Returns ok=false instead of reverting when the feed's decimals() call fails or
    ///      returns a value that would make the conversion overflow. Like the _isStale
    ///      underflow, a decimals() revert or an arithmetic panic here would execute inside
    ///      the caller's try SUCCESS branch, where the catch cannot catch it — the panic
    ///      would propagate and brick every fee-collecting registration path. A broken feed
    ///      must degrade to the fallback price, not revert.
    /// @param price Raw price from Chainlink (int256), must be positive (caller checks)
    /// @return ok Whether the conversion succeeded
    /// @return cents Price in USD cents (minimum 1 cent to prevent division by zero)
    function _tryToCents(int256 price) internal view returns (bool ok, uint256 cents) {
        uint8 feedDecimals;
        try _priceFeed.decimals() returns (uint8 d) {
            feedDecimals = d;
        } catch {
            return (false, 0);
        }

        // Chainlink ETH/USD typically returns 8 decimals
        // To convert to cents (2 decimals), divide by 10^(decimals-2) = 10^6
        if (feedDecimals <= 2) {
            // casting to 'uint256' is safe because caller has checked price > 0
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 p = uint256(price);
            // Guard the multiplication: an absurd price would panic past the caller's catch
            if (p > type(uint256).max / 100) return (false, 0);
            cents = p * 10 ** (2 - feedDecimals);
        } else {
            // 10 ** (feedDecimals - 2) overflows uint256 for feedDecimals > 79; treat any
            // such feed as broken rather than panicking
            if (feedDecimals > 77) return (false, 0);
            // casting to 'uint256' is safe because caller has checked price > 0
            // forge-lint: disable-next-line(unsafe-typecast)
            cents = uint256(price) / 10 ** (feedDecimals - 2);
        }
        // Ensure minimum 1 cent to prevent division by zero in fee calculation
        return (true, cents > 0 ? cents : 1);
    }

    /// @inheritdoc IFeeManager
    /// @dev ⚠️ NOT a view function - opportunistically syncs fallback once per interval.
    ///      This function MUTATES STATE when the sync interval has passed.
    ///      If you need a pure read, use getEthPriceUsdCentsView() instead.
    function syncAndGetEthPriceUsdCents() public returns (uint256) {
        // Manual-only mode: no oracle configured
        if (address(_priceFeed) == address(0)) {
            return fallbackEthPriceUsdCents;
        }

        // Try to read from Chainlink
        try _priceFeed.latestRoundData() returns (uint80, int256 price, uint256, uint256 updatedAt, uint80) {
            // Check staleness (>4 hours old by default)
            if (_isStale(updatedAt)) {
                return fallbackEthPriceUsdCents;
            }
            // Check for invalid price
            if (price <= 0) {
                return fallbackEthPriceUsdCents;
            }

            // Convert to cents using feed's decimals; a broken decimals() falls back
            (bool ok, uint256 livePrice) = _tryToCents(price);
            if (!ok) {
                return fallbackEthPriceUsdCents;
            }

            // Sanity bounds: a fresh, positive, well-formed but WRONG answer is the one case
            // every other guard here misses. See {_withinBounds}.
            if (!_withinBounds(livePrice)) {
                emit OraclePriceRejected(livePrice);
                return fallbackEthPriceUsdCents;
            }

            // Opportunistic sync: update fallback if interval has passed
            // Cost: ~100 gas for read + ~10k gas for write (only when triggered)
            // Most calls just add ~100 gas, one user per interval pays ~10k extra
            if (block.timestamp - lastFallbackSync > fallbackSyncInterval) {
                fallbackEthPriceUsdCents = livePrice;
                lastFallbackSync = block.timestamp;
                emit FallbackPriceSynced(livePrice);
            }

            return livePrice;
        } catch {
            // Oracle call failed
            return fallbackEthPriceUsdCents;
        }
    }

    /// @inheritdoc IFeeManager
    function getEthPriceUsdCentsView() public view returns (uint256) {
        if (address(_priceFeed) == address(0)) {
            return fallbackEthPriceUsdCents;
        }

        try _priceFeed.latestRoundData() returns (uint80, int256 price, uint256, uint256 updatedAt, uint80) {
            if (_isStale(updatedAt) || price <= 0) {
                return fallbackEthPriceUsdCents;
            }
            (bool ok, uint256 livePrice) = _tryToCents(price);
            // Must mirror syncAndGetEthPriceUsdCents exactly, or the quoted fee and the collected
            // fee disagree. This one is `view`, so it cannot emit OraclePriceRejected.
            if (!ok || !_withinBounds(livePrice)) return fallbackEthPriceUsdCents;
            return livePrice;
        } catch {
            return fallbackEthPriceUsdCents;
        }
    }

    /// @notice Rejects a well-formed oracle answer whose VALUE is implausible, so a compromised or
    ///         misconfigured feed cannot price a $5 registration at 5 ETH or drop it to free.
    /// @dev Is a converted oracle answer inside the configured sanity band?
    ///
    ///      Every other guard on this path defends against a MISSING answer — a reverting feed, a
    ///      stale round, a non-positive price, a broken `decimals()`. Nothing defended against a
    ///      fresh, positive, correctly-encoded answer that is simply wrong, and the fee formula
    ///      `baseFeeUsdCents * 1e18 / ethPriceUsdCents` is unbounded in both directions:
    ///
    ///        - a $1 answer prices a $5 registration at 5 ETH;
    ///        - a sub-cent answer is floored to 1 cent by {_tryToCents} and yields 500 ETH;
    ///        - a 1e20 answer makes registration free, so the fee stops deterring sybil spam.
    ///
    ///      Out-of-band answers fall back to the last known-good price rather than reverting: a
    ///      revert here would brick every fee-collecting registration path, which is a strictly
    ///      worse failure than quoting a slightly stale price.
    /// @param priceUsdCents Converted price in USD cents
    /// @return True if within [minEthPriceUsdCents, maxEthPriceUsdCents]
    function _withinBounds(uint256 priceUsdCents) internal view returns (bool) {
        return priceUsdCents >= minEthPriceUsdCents && priceUsdCents <= maxEthPriceUsdCents;
    }

    /// @dev Is the feed's last update too old to trust?
    ///
    ///      Written as an explicit comparison rather than `block.timestamp - updatedAt >
    ///      threshold` because that subtraction underflows when a malfunctioning feed reports
    ///      a FUTURE `updatedAt`. The underflow panic happens inside the try's SUCCESS branch,
    ///      so the surrounding `catch` does not catch it — the panic propagates and every fee
    ///      quote reverts, which bricks every registration path that collects a fee.
    ///
    ///      A future or zero timestamp means the feed is misbehaving, so both are treated as
    ///      stale: fall back to the last known-good price instead of reverting.
    function _isStale(uint256 updatedAt) internal view returns (bool) {
        if (updatedAt == 0) return true; // incomplete round
        if (updatedAt > block.timestamp) return true; // future timestamp - feed is broken
        return block.timestamp - updatedAt > stalePriceThreshold;
    }

    /// @inheritdoc IFeeManager
    /// @dev Formula: (baseFeeUsdCents * 1e18) / ethPriceUsdCents
    function currentFeeWei() public view returns (uint256) {
        if (baseFeeUsdCents == 0) return 0; // Free registrations
        uint256 ethPrice = getEthPriceUsdCentsView();
        if (ethPrice == 0) revert Fee__InvalidPrice();
        return (baseFeeUsdCents * 1e18) / ethPrice;
    }

    /// @inheritdoc IFeeManager
    /// @dev Formula: (operatorBatchFeeUsdCents * 1e18) / ethPriceUsdCents
    function operatorBatchFeeWei() public view returns (uint256) {
        if (operatorBatchFeeUsdCents == 0) return 0; // Free batch submissions
        uint256 ethPrice = getEthPriceUsdCentsView();
        if (ethPrice == 0) revert Fee__InvalidPrice();
        return (operatorBatchFeeUsdCents * 1e18) / ethPrice;
    }

    /// @inheritdoc IFeeManager
    function validateFee(uint256 payment) external view returns (bool) {
        uint256 required = currentFeeWei();
        if (payment < required) revert Fee__Insufficient();
        return true;
    }

    /// @inheritdoc IFeeManager
    function priceFeed() external view returns (address) {
        return address(_priceFeed);
    }

    /// @inheritdoc IFeeManager
    function useChainlink() external view returns (bool) {
        return address(_priceFeed) != address(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PERMISSIONLESS FALLBACK REFRESH
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFeeManager
    /// @dev Only copies LIVE Chainlink price - caller cannot set arbitrary value
    function refreshFallbackPrice() external {
        if (address(_priceFeed) == address(0)) revert Fee__NoOracle();

        (, int256 price,, uint256 updatedAt,) = _priceFeed.latestRoundData();

        if (price <= 0) revert Fee__InvalidPrice();
        // _isStale, not raw subtraction: a future updatedAt would otherwise panic instead of
        // reverting with the intended Fee__StalePrice.
        if (_isStale(updatedAt)) revert Fee__StalePrice();

        (bool ok, uint256 newPrice) = _tryToCents(price);
        if (!ok) revert Fee__InvalidPrice();
        // This function is permissionless and WRITES the fallback. Without the bounds check a
        // single out-of-band oracle answer would be laundered into the stored fallback price,
        // which then survives long after the feed recovered. Reverting is correct here (unlike on
        // the read paths): nothing depends on this call succeeding.
        if (!_withinBounds(newPrice)) revert Fee__PriceOutOfBounds();
        fallbackEthPriceUsdCents = newPrice;
        lastFallbackSync = block.timestamp;
        emit FallbackPriceRefreshed(newPrice);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IFeeManager
    /// @dev Immediate during setup; after {completeSetup} use
    ///      {proposeBaseFee} → wait ACTIVATION_DELAY → {activateBaseFee}.
    function setBaseFee(uint256 _baseFeeUsdCents) external onlyOwner onlyDuringSetup {
        _setBaseFee(_baseFeeUsdCents);
    }

    /// @inheritdoc IFeeManager
    /// @dev Immediate during setup; afterwards {proposeOperatorBatchFee} / {activateOperatorBatchFee}.
    function setOperatorBatchFee(uint256 _operatorBatchFeeUsdCents) external onlyOwner onlyDuringSetup {
        _setOperatorBatchFee(_operatorBatchFeeUsdCents);
    }

    /// @inheritdoc IFeeManager
    /// @dev Immediate during setup; afterwards {proposeFallbackPrice} / {activateFallbackPrice}.
    function setFallbackPrice(uint256 _fallbackEthPriceUsdCents) external onlyOwner onlyDuringSetup {
        _setFallbackPrice(_fallbackEthPriceUsdCents);
    }

    /// @inheritdoc IFeeManager
    /// @dev Pointing at a NEW feed is a trust-boundary change and is timelocked after setup
    ///      ({proposeParcelFeed}-style pair below). Pointing at `address(0)` stays immediate at
    ///      all times: that disables the oracle and drops the contract to the manual fallback
    ///      price, which only ever NARROWS what this contract trusts. It is the targeted
    ///      emergency response to a feed that has started answering wrongly-but-plausibly, and it
    ///      matches the `address(0)`-is-a-revoke carve-out used for trusted sources, forwarders
    ///      and ownership transfers elsewhere in this system.
    function setPriceFeed(address priceFeedAddress) external onlyOwner {
        if (priceFeedAddress != address(0) && setupComplete) revert TimelockOwnable__UseTimelockedPath();
        _priceFeed = AggregatorV3Interface(priceFeedAddress);
        emit PriceFeedConfigured(priceFeedAddress);
    }

    /// @inheritdoc IFeeManager
    /// @notice Setting to 0 disables the oracle (all prices considered stale)
    /// @dev Capped at {MAX_STALE_PRICE_THRESHOLD}. Immediate during setup; afterwards
    ///      {proposeStalePriceThreshold} / {activateStalePriceThreshold}.
    function setStalePriceThreshold(uint256 _stalePriceThreshold) external onlyOwner onlyDuringSetup {
        _setStalePriceThreshold(_stalePriceThreshold);
    }

    /// @inheritdoc IFeeManager
    /// @notice Setting to 0 triggers sync on every syncAndGetEthPriceUsdCents() call (higher gas)
    ///         Consider using reasonable minimum (e.g., 1 hour) for normal operation
    /// @dev Deliberately NOT timelocked. This is a gas-tuning knob only: it cannot change a quoted
    ///      fee, cannot reject a payment, and cannot repoint any trust boundary. Its worst abuse is
    ///      making one caller per call pay an extra SSTORE.
    function setFallbackSyncInterval(uint256 _fallbackSyncInterval) external onlyOwner {
        uint256 oldInterval = fallbackSyncInterval;
        fallbackSyncInterval = _fallbackSyncInterval;
        emit FallbackSyncIntervalUpdated(oldInterval, _fallbackSyncInterval);
    }

    /// @notice Set the oracle sanity bounds (immediate during setup)
    /// @dev Afterwards {proposePriceBounds} / {activatePriceBounds}. See {_withinBounds}.
    /// @param minUsdCents Lower bound in USD cents
    /// @param maxUsdCents Upper bound in USD cents
    function setPriceBounds(uint256 minUsdCents, uint256 maxUsdCents) external onlyOwner onlyDuringSetup {
        _setPriceBounds(minUsdCents, maxUsdCents);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIMELOCKED ADMIN (post-setup path)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Propose a base fee change (2-day delay)
    /// @param _baseFeeUsdCents New base fee in USD cents
    function proposeBaseFee(uint256 _baseFeeUsdCents) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setBaseFee", _baseFeeUsdCents)));
    }

    /// @notice Activate a previously proposed base fee change
    /// @param _baseFeeUsdCents The exact value passed to {proposeBaseFee}
    function activateBaseFee(uint256 _baseFeeUsdCents) external onlyOwner {
        _activateAction(keccak256(abi.encode("setBaseFee", _baseFeeUsdCents)));
        _setBaseFee(_baseFeeUsdCents);
    }

    /// @notice Propose an operator batch fee change (2-day delay)
    /// @param _operatorBatchFeeUsdCents New per-batch fee in USD cents
    function proposeOperatorBatchFee(uint256 _operatorBatchFeeUsdCents) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setOperatorBatchFee", _operatorBatchFeeUsdCents)));
    }

    /// @notice Activate a previously proposed operator batch fee change
    /// @param _operatorBatchFeeUsdCents The exact value passed to {proposeOperatorBatchFee}
    function activateOperatorBatchFee(uint256 _operatorBatchFeeUsdCents) external onlyOwner {
        _activateAction(keccak256(abi.encode("setOperatorBatchFee", _operatorBatchFeeUsdCents)));
        _setOperatorBatchFee(_operatorBatchFeeUsdCents);
    }

    /// @notice Propose a fallback price change (2-day delay)
    /// @param _fallbackEthPriceUsdCents New fallback ETH price in USD cents
    function proposeFallbackPrice(uint256 _fallbackEthPriceUsdCents) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setFallbackPrice", _fallbackEthPriceUsdCents)));
    }

    /// @notice Activate a previously proposed fallback price change
    /// @param _fallbackEthPriceUsdCents The exact value passed to {proposeFallbackPrice}
    function activateFallbackPrice(uint256 _fallbackEthPriceUsdCents) external onlyOwner {
        _activateAction(keccak256(abi.encode("setFallbackPrice", _fallbackEthPriceUsdCents)));
        _setFallbackPrice(_fallbackEthPriceUsdCents);
    }

    /// @notice Propose pointing at a new Chainlink feed (2-day delay)
    /// @dev Un-pointing (address(0)) needs no proposal — see {setPriceFeed}.
    /// @param priceFeedAddress The new feed address (must be non-zero)
    function proposePriceFeed(address priceFeedAddress) external onlyOwner {
        if (priceFeedAddress == address(0)) revert Fee__InvalidPrice();
        _proposeAction(keccak256(abi.encode("setPriceFeed", priceFeedAddress)));
    }

    /// @notice Activate a previously proposed price feed change
    /// @param priceFeedAddress The exact address passed to {proposePriceFeed}
    function activatePriceFeed(address priceFeedAddress) external onlyOwner {
        if (priceFeedAddress == address(0)) revert Fee__InvalidPrice();
        _activateAction(keccak256(abi.encode("setPriceFeed", priceFeedAddress)));
        _priceFeed = AggregatorV3Interface(priceFeedAddress);
        emit PriceFeedConfigured(priceFeedAddress);
    }

    /// @notice Propose a staleness threshold change (2-day delay)
    /// @param _stalePriceThreshold New threshold in seconds
    function proposeStalePriceThreshold(uint256 _stalePriceThreshold) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setStalePriceThreshold", _stalePriceThreshold)));
    }

    /// @notice Activate a previously proposed staleness threshold change
    /// @param _stalePriceThreshold The exact value passed to {proposeStalePriceThreshold}
    function activateStalePriceThreshold(uint256 _stalePriceThreshold) external onlyOwner {
        _activateAction(keccak256(abi.encode("setStalePriceThreshold", _stalePriceThreshold)));
        _setStalePriceThreshold(_stalePriceThreshold);
    }

    /// @notice Propose new oracle sanity bounds (2-day delay)
    /// @param minUsdCents Lower bound in USD cents
    /// @param maxUsdCents Upper bound in USD cents
    function proposePriceBounds(uint256 minUsdCents, uint256 maxUsdCents) external onlyOwner {
        _proposeAction(keccak256(abi.encode("setPriceBounds", minUsdCents, maxUsdCents)));
    }

    /// @notice Activate previously proposed oracle sanity bounds
    /// @param minUsdCents The exact lower bound passed to {proposePriceBounds}
    /// @param maxUsdCents The exact upper bound passed to {proposePriceBounds}
    function activatePriceBounds(uint256 minUsdCents, uint256 maxUsdCents) external onlyOwner {
        _activateAction(keccak256(abi.encode("setPriceBounds", minUsdCents, maxUsdCents)));
        _setPriceBounds(minUsdCents, maxUsdCents);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL SETTERS (single implementation shared by both paths)
    // ═══════════════════════════════════════════════════════════════════════════

    function _setBaseFee(uint256 _baseFeeUsdCents) internal {
        // Prevent overflow in currentFeeWei calculation: (baseFeeUsdCents * 1e18) / ethPrice
        // Max safe value: type(uint256).max / 1e18 ≈ 1.15e59 (way beyond any realistic fee)
        if (_baseFeeUsdCents > type(uint256).max / 1e18) {
            revert Fee__InvalidPrice();
        }
        uint256 oldFee = baseFeeUsdCents;
        baseFeeUsdCents = _baseFeeUsdCents;
        emit BaseFeeUpdated(oldFee, _baseFeeUsdCents);
    }

    function _setOperatorBatchFee(uint256 _operatorBatchFeeUsdCents) internal {
        // Prevent overflow in operatorBatchFeeWei calculation
        if (_operatorBatchFeeUsdCents > type(uint256).max / 1e18) {
            revert Fee__InvalidPrice();
        }
        uint256 oldFee = operatorBatchFeeUsdCents;
        operatorBatchFeeUsdCents = _operatorBatchFeeUsdCents;
        emit OperatorBatchFeeUpdated(oldFee, _operatorBatchFeeUsdCents);
    }

    /// @dev The fallback is what every price path degrades to, so it takes the same sanity band
    ///      as a live oracle answer. Otherwise the bound on the oracle is trivially sidestepped by
    ///      setting the fallback to 1 cent and letting the feed go stale.
    function _setFallbackPrice(uint256 _fallbackEthPriceUsdCents) internal {
        if (_fallbackEthPriceUsdCents == 0) revert Fee__InvalidPrice();
        if (!_withinBounds(_fallbackEthPriceUsdCents)) revert Fee__PriceOutOfBounds();
        uint256 oldPrice = fallbackEthPriceUsdCents;
        fallbackEthPriceUsdCents = _fallbackEthPriceUsdCents;
        emit FallbackPriceUpdated(oldPrice, _fallbackEthPriceUsdCents);
    }

    function _setStalePriceThreshold(uint256 _stalePriceThreshold) internal {
        if (_stalePriceThreshold > MAX_STALE_PRICE_THRESHOLD) revert Fee__InvalidThreshold();
        uint256 oldThreshold = stalePriceThreshold;
        stalePriceThreshold = _stalePriceThreshold;
        emit StalePriceThresholdUpdated(oldThreshold, _stalePriceThreshold);
    }

    /// @dev Narrowing the band must not orphan the price already in storage — if the current
    ///      fallback fell outside the new bounds, {_setFallbackPrice} could never restore it and
    ///      every read path would be quoting a value the contract itself considers invalid.
    function _setPriceBounds(uint256 minUsdCents, uint256 maxUsdCents) internal {
        if (minUsdCents < MIN_PRICE_BOUND || maxUsdCents > MAX_PRICE_BOUND || minUsdCents > maxUsdCents) {
            revert Fee__InvalidBounds();
        }
        if (fallbackEthPriceUsdCents < minUsdCents || fallbackEthPriceUsdCents > maxUsdCents) {
            revert Fee__InvalidBounds();
        }
        minEthPriceUsdCents = minUsdCents;
        maxEthPriceUsdCents = maxUsdCents;
        emit PriceBoundsUpdated(minUsdCents, maxUsdCents);
    }
}
