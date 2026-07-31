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
    files: ['**/dist/**', '**/storybook-static/**', '**/coverage/**', 'packages/contracts/out/**'],
    overrides: [{ files: ['**/dist/**'], rules: ['react-doctor/artifact-secret-leak'] }],
  },
};
