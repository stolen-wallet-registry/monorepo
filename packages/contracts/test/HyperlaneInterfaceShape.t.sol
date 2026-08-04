// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import { Test } from "forge-std/Test.sol";
import { IMailbox } from "@hyperlane-xyz/core/contracts/interfaces/IMailbox.sol";
import { IPostDispatchHook } from "@hyperlane-xyz/core/contracts/interfaces/hooks/IPostDispatchHook.sol";

/**
 * Pins the vendored Hyperlane interface to the v3 ABI, WITHOUT a network.
 *
 * ── Why this exists next to HyperlaneForked.t.sol ────────────────────────────────────────
 *
 * The v2→v3 mismatch that `HyperlaneForked.t.sol` was written for shipped because
 * `MockMailbox` had the same wrong shape as the adapter: a mock only ever proves we agree with
 * ourselves. The fork test breaks that circle, but it `vm.skip`s itself without
 * `OPTIMISM_SEPOLIA_RPC` — so in an ordinary run NOTHING checks the shape, while the suite
 * total still reads as though the integration were covered.
 *
 * That gap splits into two risks, and only one of them needs a live chain:
 *
 *   1. OUR vendored copy under `src/vendor/hyperlane/` drifts from the v3 ABI — someone
 *      restores a v2 file, edits a signature, or regenerates from the wrong tag. This is the
 *      failure that actually happened, and it is fully decidable offline. THIS FILE.
 *   2. THE DEPLOYED MAILBOX changes under us (Hyperlane ships a v4 and redeploys). Nothing
 *      local can see that. `HyperlaneForked.t.sol`, run before a deployment.
 *
 * This is not a substitute for the fork test. It is the half of the coverage that should never
 * have depended on an RPC being configured.
 */
contract HyperlaneInterfaceShapeTest is Test {
    /// @dev Probed by the fork test to decide "is this really a v3 mailbox". Absent from v2.
    ///      Values from `cast sig`, not read back out of the interface — a test that derives
    ///      its expectation from the thing under test asserts nothing.
    bytes4 constant DEFAULT_HOOK = 0x3d1250b7; // defaultHook()
    bytes4 constant REQUIRED_HOOK = 0xd6d08a09; // requiredHook()
    bytes4 constant LATEST_DISPATCHED_ID = 0x134fbb4f; // latestDispatchedId()
    bytes4 constant LOCAL_DOMAIN = 0x8d3638f4; // localDomain()

    /**
     * The v3 guard for the two functions the adapter actually calls. NEVER EXECUTED — its job
     * is to fail COMPILATION, which fails the whole suite, if the vendored interface stops
     * declaring these exact overloads.
     *
     * A compile-time probe rather than a selector assertion, because `dispatch` and
     * `quoteDispatch` are each overloaded three ways in v3: `IMailbox.dispatch.selector` and
     * `abi.encodeCall(IMailbox.dispatch, ...)` both fail to compile (ambiguous member, and
     * solc 0.8.24 will not resolve it from the target type or the argument tuple), and a
     * runtime call cannot record `quoteDispatch` because it is `view` — solc emits STATICCALL,
     * so a recorder cannot write down what it received.
     *
     * What this pins, which matters more than the name:
     *
     *  - THE ARGUMENT TYPES. Swapping `bytes32 recipient` for `address recipient` still
     *    compiles at the adapter's own call site (it builds the argument locally) but changes
     *    the selector, so every dispatch would revert against a real Mailbox with nothing
     *    failing locally. Here it is a build error.
     *  - PAYABILITY, which no selector can express. `{ value: }` only type-checks against a
     *    `payable` declaration. This is the actual v2→v3 break for us: the adapter forwards the
     *    quoted fee with `dispatch{value: fee}(...)`, and against a non-payable `dispatch` that
     *    reverts for every single registration.
     *  - v3-ONLY EXISTENCE. Hyperlane v2's IMailbox had no `quoteDispatch` at all and no
     *    metadata-carrying `dispatch` overload, so a v2 file cannot satisfy either line.
     */
    function _v3ShapeProbe(IMailbox m) internal {
        m.dispatch{ value: 1 }(uint32(0), bytes32(0), bytes(""), bytes(""));
        m.quoteDispatch(uint32(0), bytes32(0), bytes(""), bytes(""));
    }

    /// @notice The v3 accessors the forked suite probes are present and correctly encoded.
    /// @dev Pinned so their absence fails in every ordinary run, not only in the fork run that
    ///      usually does not happen. These four are not overloaded, so `.selector` is
    ///      unambiguous and can be compared directly.
    function test_V3AccessorSelectors() public pure {
        assertEq(IMailbox.defaultHook.selector, DEFAULT_HOOK, "defaultHook() selector changed");
        assertEq(IMailbox.requiredHook.selector, REQUIRED_HOOK, "requiredHook() selector changed");
        assertEq(IMailbox.latestDispatchedId.selector, LATEST_DISPATCHED_ID, "latestDispatchedId() selector changed");
        assertEq(IMailbox.localDomain.selector, LOCAL_DOMAIN, "localDomain() selector changed");
    }

    /// @notice The hook interface those accessors return is the v3 post-dispatch hook.
    /// @dev `defaultHook()`/`requiredHook()` returning some other type would compile fine while
    ///      making the fork test's "is this v3" probe meaningless.
    function test_HookInterfaceIsPostDispatch() public pure {
        assertEq(
            IPostDispatchHook.quoteDispatch.selector,
            bytes4(keccak256("quoteDispatch(bytes,bytes)")),
            "IPostDispatchHook.quoteDispatch is not the v3 shape"
        );
    }

    /// @notice Documents that {_v3ShapeProbe} is a build-time guard, not dead code.
    /// @dev Without this, the probe reads as an unused private function and is exactly the kind
    ///      of thing a later cleanup deletes — taking the v2-regression guard with it.
    function test_ShapeProbeIsCompiledNotExecuted() public pure {
        assertTrue(
            true, "placeholder: the real assertion is that _v3ShapeProbe above compiles against the vendored IMailbox"
        );
    }
}
