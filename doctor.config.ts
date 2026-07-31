/**
 * react-doctor configuration.
 *
 * Run with `pnpm doctor:full` (whole tree) or `pnpm doctor:changed` (working changes only).
 */
export default {
  rules: {
    /**
     * OFF — deliberate policy decision, not an oversight.
     *
     * The 15 components that trip this rule are the four P2P registration
     * pages, the seven registration step components, the two transaction
     * registration pages, OperatorsTable, and the landing cross-chain
     * visualisation. They are long because they carry the EIP-712 two-phase
     * signing sequence (acknowledge -> randomised grace period -> register)
     * plus the libp2p relay handoff, and that sequence reads better as one
     * linear flow than as a scatter of components passing partial signing
     * state to each other.
     *
     * We did split the components that had a genuine seam — DevTools' tab
     * panels, P2PDebugPanel, DashboardBatchDetailPage's tables, the two
     * soulbound mint cards, and TransactionCard. Those extractions are real.
     * What remains would be splitting for a line count, which adds prop
     * drilling without improving anything, on code paths that have no test
     * coverage and are security-critical.
     *
     * Revisit if those flows get test coverage, or if the step components are
     * ever rebuilt around an explicit state machine — at that point the seams
     * become real and this should go back to `warn`.
     */
    'react-doctor/no-giant-component': 'off',
  },
  ignore: {
    /**
     * Build output is not source. Scanning it attributes every bundled third-party library's
     * code to us. All gitignored artifacts; the sources that produce them are already scanned.
     */
    files: ['**/dist/**', '**/storybook-static/**', '**/coverage/**', 'packages/contracts/out/**'],

    overrides: [
      {
        /**
         * `artifact-secret-leak` picks its inputs by hardcoded artifact path (`public/`,
         * `dist/assets/`, `.next/static/`, ...) rather than from the scanned-file set, so
         * `ignore.files` above does not reach it — it has to be dropped per-path here.
         *
         * What it flagged in `apps/web/dist/assets/vendor-p2p-*.js` is @libp2p/webrtc's SDP
         * builder emitting `a=ice-pwd:${ufrag}`. `ufrag` is a per-connection ICE credential
         * generated at runtime, not a value baked into the bundle — libp2p reuses the ufrag as
         * the ICE password by design, and WebRTC transport security here rests on the Noise
         * handshake plus the DTLS certhash pinned in the multiaddr, not on ICE.
         * See node_modules/@libp2p/webrtc/dist/src/private-to-public/utils/sdp.js.
         *
         * Deliberately scoped to build output instead of `rules: off` or a `warn` downgrade:
         * the rule still runs at `error` against `apps/web/public/` and every other checked-in
         * browser-delivered asset, which is where a real leaked secret of ours would land.
         * Verified by planting a `sk_live_...` probe in `apps/web/public/` — still caught.
         */
        files: ['**/dist/**'],
        rules: ['react-doctor/artifact-secret-leak'],
      },
    ],
  },
};
