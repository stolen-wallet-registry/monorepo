'use client';

import { useRef, useEffect, useState, useReducer, useCallback } from 'react';
import { Shield, Droplets, CircleDot } from 'lucide-react';
import {
  AnimatedBeam,
  cn,
  TooltipProvider,
  // Network icons - L2s
  NetworkEthereum,
  NetworkOptimism,
  NetworkArbitrumOne,
  NetworkPolygon,
  NetworkZksync,
  NetworkLinea,
  NetworkGnosis,
  NetworkCelo,
  // Network icons - L1s
  NetworkBinanceSmartChain,
  NetworkSolana,
  NetworkBitcoin,
  NetworkAvalanche,
  NetworkFantom,
  NetworkNearProtocol,
  NetworkCosmosHub,
  // Exchange icons
  ExchangeCoinbase,
  ExchangeKraken,
  ExchangeGemini,
  ExchangeBinance,
  // Wallet icons
  WalletMetamask,
  WalletRainbow,
  WalletCoinbase,
  // Token icons (for bridges)
  TokenLINK,
} from '@swr/ui';

import {
  BEAM_DURATION,
  CYCLE_PAUSE,
  IconCircle,
  BridgeIcon,
  ChainalysisLogo,
  HyperlaneLogo,
  SealTeamLogo,
  WormholeLogo,
  GroupContainer,
  RegistryHub,
  SectionTitle,
  Caip10Emission,
} from './shared';

import type { CrossChainVisualizationProps } from './types';

// Dev mode flag - set to true for testing beam animations
const DEV_MODE = false;

// Global timing tracker for logging (only used in DEV_MODE)
let cycleStartTime = 0;
const log = (msg: string, data?: object) => {
  if (!DEV_MODE) return;
  const now = performance.now();
  const elapsed = cycleStartTime ? `@${(now - cycleStartTime).toFixed(0)}ms` : '@0ms';
  console.log(`[Beam ${elapsed}] ${msg}`, data || '');
};

// ===== STATE MACHINE FOR BEAM ANIMATION =====
// CENTRALIZED TIMING: Desktop.tsx manages ALL timing via useEffect watching currentStep.
// AnimatedBeam's onComplete is NOT used - timing is deterministic via setTimeout.

type StepName =
  | 'idle'
  | 'rf_networkToBridges' // Report Fraud: network → bridges
  | 'rf_bridgesToHub' // Report Fraud: bridges → hub
  | 'rf_hubToListeners' // Report Fraud: hub → all listeners
  | 'to_operatorToHub' // Trusted Operators: operator → hub
  | 'to_hubToListeners'; // Trusted Operators: hub → listeners

interface AnimationState {
  currentStep: StepName;
  activeBeams: Set<string>;
  pulseListeners: boolean;
  triggerEmission: boolean;
  selectedNetwork: number; // 0-3 for random network selection
}

type AnimationAction =
  | { type: 'START_CYCLE'; flow: 'reportFraud' | 'trustedOperators'; networkIndex: number }
  | { type: 'SET_STEP'; step: StepName; networkIndex?: number } // Direct step setting - bypasses React effects
  | { type: 'NEXT_STEP' } // Legacy - kept for compatibility
  | { type: 'RESET_TRIGGERS' };

const initialState: AnimationState = {
  currentStep: 'idle',
  activeBeams: new Set(),
  pulseListeners: false,
  triggerEmission: false,
  selectedNetwork: 0,
};

// Define the step transitions for each flow
const NETWORK_BEAMS = ['ethEcosystem', 'evmChains', 'nonEvm', 'btc'] as const;

// Animation step sequences for each flow
const REPORT_FRAUD_STEPS: StepName[] = [
  'rf_networkToBridges',
  'rf_bridgesToHub',
  'rf_hubToListeners',
];
const TRUSTED_OPS_STEPS: StepName[] = ['to_operatorToHub', 'to_hubToListeners'];

// Compute active beams based on step name
function getActiveBeamsForStep(step: StepName, networkIndex: number): Set<string> {
  switch (step) {
    case 'rf_networkToBridges':
      return new Set([NETWORK_BEAMS[networkIndex]]);
    case 'rf_bridgesToHub':
      return new Set(['bridgesToHub']);
    case 'rf_hubToListeners':
    case 'to_hubToListeners':
      return new Set(['exchanges', 'wallets', 'security']);
    case 'to_operatorToHub':
      return new Set(['operatorToHub']);
    case 'idle':
    default:
      return new Set();
  }
}

function animationReducer(state: AnimationState, action: AnimationAction): AnimationState {
  switch (action.type) {
    case 'SET_STEP': {
      // Direct step setting - used by runAnimationSequence for precise timing
      const { step, networkIndex = state.selectedNetwork } = action;
      const isListenerStep = step === 'rf_hubToListeners' || step === 'to_hubToListeners';

      return {
        ...state,
        currentStep: step,
        activeBeams: getActiveBeamsForStep(step, networkIndex),
        selectedNetwork: networkIndex,
        pulseListeners: isListenerStep,
        triggerEmission: isListenerStep,
      };
    }

    case 'START_CYCLE': {
      const { flow, networkIndex } = action;
      cycleStartTime = performance.now(); // Reset timing on cycle start
      log('START_CYCLE', { flow, networkIndex });

      if (flow === 'reportFraud') {
        const activeBeam = NETWORK_BEAMS[networkIndex];
        log('→ rf_networkToBridges', { activeBeam });
        return {
          ...state,
          currentStep: 'rf_networkToBridges',
          activeBeams: new Set([activeBeam]),
          pulseListeners: false,
          triggerEmission: false,
          selectedNetwork: networkIndex,
        };
      } else {
        log('→ to_operatorToHub');
        return {
          ...state,
          currentStep: 'to_operatorToHub',
          activeBeams: new Set(['operatorToHub']),
          pulseListeners: false,
          triggerEmission: false,
          selectedNetwork: 0,
        };
      }
    }

    case 'NEXT_STEP': {
      // Centralized step progression - no dependency on beam callbacks
      const { currentStep } = state;
      log('NEXT_STEP from', { currentStep });

      switch (currentStep) {
        case 'rf_networkToBridges':
          log('→ rf_bridgesToHub');
          return {
            ...state,
            currentStep: 'rf_bridgesToHub',
            activeBeams: new Set(['bridgesToHub']),
          };

        case 'rf_bridgesToHub':
          log('→ rf_hubToListeners (+ pulse + emission)');
          return {
            ...state,
            currentStep: 'rf_hubToListeners',
            activeBeams: new Set(['exchanges', 'wallets', 'security']),
            pulseListeners: true,
            triggerEmission: true,
          };

        case 'rf_hubToListeners':
          log('→ idle (cycle complete)');
          return {
            ...state,
            currentStep: 'idle',
            activeBeams: new Set(),
          };

        case 'to_operatorToHub':
          log('→ to_hubToListeners (+ pulse + emission)');
          return {
            ...state,
            currentStep: 'to_hubToListeners',
            activeBeams: new Set(['exchanges', 'wallets', 'security']),
            pulseListeners: true,
            triggerEmission: true,
          };

        case 'to_hubToListeners':
          log('→ idle (cycle complete)');
          return {
            ...state,
            currentStep: 'idle',
            activeBeams: new Set(),
          };

        default:
          return state;
      }
    }

    case 'RESET_TRIGGERS': {
      return {
        ...state,
        pulseListeners: false,
        triggerEmission: false,
      };
    }

    default:
      return state;
  }
}

// Static connection line using ResizeObserver
function StaticConnection({
  containerRef,
  fromRef,
  toRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [pathD, setPathD] = useState('');

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rectA = fromRef.current.getBoundingClientRect();
        const rectB = toRef.current.getBoundingClientRect();

        const startX = rectA.left - containerRect.left + rectA.width / 2;
        const startY = rectA.top - containerRect.top + rectA.height / 2;
        const endX = rectB.left - containerRect.left + rectB.width / 2;
        const endY = rectB.top - containerRect.top + rectB.height / 2;

        setPathD(`M ${startX},${startY} L ${endX},${endY}`);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updatePath();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    updatePath();
    return () => resizeObserver.disconnect();
  }, [containerRef, fromRef, toRef]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
      width="100%"
      height="100%"
    >
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="4 4"
        className="opacity-15 dark:opacity-30"
      />
    </svg>
  );
}

// Visually hidden but accessible to screen readers
function ScreenReaderDescription() {
  return (
    <div id="cross-chain-viz-description" className="sr-only">
      <h3>Cross-Chain Fraud Reporting Flow</h3>
      <p>
        This visualization shows how stolen wallet reports flow through the Stolen Wallet Registry
        system across multiple blockchains.
      </p>
      <ol>
        <li>
          <strong>Step 1 - Report Fraud:</strong> Users report stolen wallets from any supported
          blockchain including Ethereum and its Layer 2s (Optimism, Arbitrum, Polygon, zkSync,
          Linea, Gnosis, Celo), EVM chains (BNB Chain, Avalanche, Fantom), non-EVM chains (Solana,
          NEAR, Cosmos), and Bitcoin.
        </li>
        <li>
          <strong>Step 2 - Cross-Chain Messaging:</strong> Reports are transmitted through
          cross-chain messaging protocols (Chainlink CCIP, Wormhole, Hyperlane) to the central
          registry. Trusted operators like Coinbase, Kraken, and security firms can also submit
          reports directly.
        </li>
        <li>
          <strong>Step 3 - Registry Settlement:</strong> All reports are consolidated on Base
          blockchain using CAIP-10 chain-agnostic identifiers, enabling tracking of addresses from
          any blockchain in a single registry.
        </li>
        <li>
          <strong>Step 4 - React to Events:</strong> Exchanges (Coinbase, Kraken, Gemini, Binance),
          wallets (MetaMask, Rainbow, Coinbase Wallet), and security services (Chainalysis, SEAL
          Team) subscribe to registry events and receive real-time alerts to protect users.
        </li>
      </ol>
    </div>
  );
}

export function CrossChainVisualizationDesktop({
  className,
  showHeader = true,
  showLabels = true,
}: CrossChainVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const hubLogoRef = useRef<HTMLDivElement>(null);

  // Animation state machine
  const [state, dispatch] = useReducer(animationReducer, initialState);

  // Dev mode controls
  const [autoPlay, setAutoPlay] = useState(!DEV_MODE); // Auto-play disabled in dev by default
  const [fastMode, setFastMode] = useState(false); // Fast beams for testing
  const effectiveBeamDuration = fastMode ? 0.3 : BEAM_DURATION; // 300ms in fast mode

  // Track if we've started to prevent StrictMode double-fire
  const hasStartedRef = useRef(false);

  // ===== CENTRALIZED TIMING =====
  // Timer chain started SYNCHRONOUSLY on trigger - bypasses React's effect scheduling entirely
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Runs the entire animation sequence with precise timing
  // networkIndex is used for rf_networkToBridges to select which network beam fires
  const runAnimationSequence = useCallback(
    (steps: StepName[], networkIndex = 0) => {
      // Clear any existing animation
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
      }

      let stepIndex = 0;
      const totalSteps = steps.length;

      const executeStep = () => {
        if (stepIndex >= totalSteps) {
          log('SET_STEP → idle');
          dispatch({ type: 'SET_STEP', step: 'idle' });
          return;
        }

        const currentStep = steps[stepIndex];
        log(`SET_STEP → ${currentStep}`);

        // Dispatch state change for this step (networkIndex only matters for first rf_ step)
        dispatch({ type: 'SET_STEP', step: currentStep, networkIndex });

        stepIndex++;

        // Schedule next step after BEAM_DURATION
        activeTimerRef.current = setTimeout(() => {
          executeStep();
        }, effectiveBeamDuration * 1000);
      };

      // Start IMMEDIATELY - no waiting for React effects
      executeStep();
    },
    [effectiveBeamDuration]
  );

  // Manual trigger functions for dev - use runAnimationSequence for precise timing
  const triggerReportFraud = useCallback(
    (networkIndex = 0) => {
      cycleStartTime = performance.now();
      log('=== REPORT FRAUD ===', { networkIndex });
      runAnimationSequence(REPORT_FRAUD_STEPS, networkIndex);
    },
    [runAnimationSequence]
  );

  const triggerTrustedOperators = useCallback(() => {
    cycleStartTime = performance.now();
    log('=== TRUSTED OPERATORS ===');
    runAnimationSequence(TRUSTED_OPS_STEPS);
  }, [runAnimationSequence]);

  // Alternate between flows - track last flow used
  const lastFlowRef = useRef<'reportFraud' | 'trustedOperators'>('trustedOperators');

  // Start next animation cycle - alternates between flows
  const startNextCycle = useCallback(() => {
    if (lastFlowRef.current === 'trustedOperators') {
      // Do report fraud with random network
      lastFlowRef.current = 'reportFraud';
      const networkIndex = Math.floor(Math.random() * 4);
      triggerReportFraud(networkIndex);
    } else {
      // Do trusted operators
      lastFlowRef.current = 'trustedOperators';
      triggerTrustedOperators();
    }
  }, [triggerReportFraud, triggerTrustedOperators]);

  // Start animation on mount (only when autoPlay is enabled)
  useEffect(() => {
    if (!autoPlay) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    // Start immediately
    startNextCycle();

    return () => {
      hasStartedRef.current = false; // Reset for Fast Refresh
    };
  }, [startNextCycle, autoPlay]);

  // When cycle goes idle, start a new cycle after brief pause
  useEffect(() => {
    if (!autoPlay) return;
    if (state.currentStep === 'idle' && hasStartedRef.current) {
      const pauseTimeout = setTimeout(() => {
        startNextCycle();
      }, CYCLE_PAUSE * 1000);

      return () => {
        clearTimeout(pauseTimeout);
      };
    }
  }, [state.currentStep, startNextCycle, autoPlay]);

  // Reset triggers after animation has time to detect transition
  useEffect(() => {
    if (state.pulseListeners || state.triggerEmission) {
      const resetDelay = fastMode ? 100 : 500;
      const resetTimeout = setTimeout(() => {
        dispatch({ type: 'RESET_TRIGGERS' });
      }, resetDelay);
      return () => clearTimeout(resetTimeout);
    }
  }, [state.pulseListeners, state.triggerEmission, fastMode]);

  // ETH L1 and L2s - core (close to ETH)
  const ethHubRef = useRef<HTMLDivElement>(null);
  const opRef = useRef<HTMLDivElement>(null);
  const arbRef = useRef<HTMLDivElement>(null);
  const polyRef = useRef<HTMLDivElement>(null);
  const zkSyncRef = useRef<HTMLDivElement>(null);
  const lineaRef = useRef<HTMLDivElement>(null);
  // ETH L2s - outer ring (with dashed connections)
  const gnosisRef = useRef<HTMLDivElement>(null);
  const celoRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  // Cluster refs for simplified beams (these are the containers)
  const ethEcosystemRef = useRef<HTMLDivElement>(null);
  const evmChainsRef = useRef<HTMLDivElement>(null);
  const nonEvmRef = useRef<HTMLDivElement>(null);
  const btcRef = useRef<HTMLDivElement>(null);

  // Edge anchor refs for left-side containers (beams exit from RIGHT edge)
  const ethRightAnchorRef = useRef<HTMLDivElement>(null);
  const evmRightAnchorRef = useRef<HTMLDivElement>(null);
  const nonEvmRightAnchorRef = useRef<HTMLDivElement>(null);
  const btcRightAnchorRef = useRef<HTMLDivElement>(null);

  // Bridges cluster refs
  const bridgesClusterRef = useRef<HTMLDivElement>(null);
  const bridgesLeftAnchorRef = useRef<HTMLDivElement>(null);
  const bridgesRightAnchorRef = useRef<HTMLDivElement>(null);

  // Hub (Base) anchor refs
  const hubLeftAnchorRef = useRef<HTMLDivElement>(null);
  const hubRightAnchorRef = useRef<HTMLDivElement>(null);
  const hubBottomAnchorRef = useRef<HTMLDivElement>(null);

  // Operators cluster refs
  const operatorsClusterRef = useRef<HTMLDivElement>(null);
  const operatorsTopAnchorRef = useRef<HTMLDivElement>(null);

  // Consumer container refs (beams enter from LEFT edge)
  const exchangesContainerRef = useRef<HTMLDivElement>(null);
  const exchangesLeftAnchorRef = useRef<HTMLDivElement>(null);
  const walletsContainerRef = useRef<HTMLDivElement>(null);
  const walletsLeftAnchorRef = useRef<HTMLDivElement>(null);
  const securityContainerRef = useRef<HTMLDivElement>(null);
  const securityLeftAnchorRef = useRef<HTMLDivElement>(null);

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn('flex flex-col items-center gap-6', className)}
        role="figure"
        aria-label="Cross-chain fraud reporting visualization"
        aria-describedby="cross-chain-viz-description"
      >
        {/* Screen reader accessible description */}
        <ScreenReaderDescription />

        {showHeader && (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">One Data Registry, Every Chain.</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Aggregates stolen wallet and transaction reports using{' '}
              <a
                href="https://chainagnostic.org/CAIPs/caip-10"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
              >
                CAIP-10
              </a>{' '}
              chain-agnostic identifiers. Exchanges, wallets, and security services listen for
              events and react in real-time to protect the ecosystem.
            </p>
          </div>
        )}

        <div
          ref={containerRef}
          className="relative flex h-[500px] w-full max-w-[1200px] items-center justify-between px-2 md:h-[600px] md:px-4 lg:h-[650px]"
          aria-hidden="true"
        >
          {/* LEFT SIDE: Networks */}
          <div className="flex w-44 flex-col items-center gap-2 md:w-52 md:gap-3 lg:w-60">
            {showLabels && (
              <SectionTitle
                title="Report Fraud"
                tooltip="Report stolen wallets or fraudulent transactions. Whether your seed phrase was compromised, you interacted with a malicious contract, or funds were drained via phishing - self-attestation requires proving wallet ownership via cryptographic signature."
              />
            )}

            {/* ETH Ecosystem Container */}
            <GroupContainer
              ref={ethEcosystemRef}
              rightAnchorRef={ethRightAnchorRef}
              label={showLabels ? 'Ethereum Ecosystem' : undefined}
              labelTooltip="Ethereum L1 and its Layer 2 rollups. L2s inherit Ethereum's security while providing faster, cheaper transactions. All settle back to Ethereum mainnet."
            >
              {/* Core L2s - tightly clustered around ETH */}
              <div className="flex items-center gap-1">
                <IconCircle ref={opRef} label="Optimism" size="xs">
                  <NetworkOptimism variant="branded" className="size-5" />
                </IconCircle>
                <IconCircle ref={arbRef} label="Arbitrum" size="xs">
                  <NetworkArbitrumOne variant="branded" className="size-5" />
                </IconCircle>
                <IconCircle ref={zkSyncRef} label="zkSync Era" size="xs">
                  <NetworkZksync variant="mono" className="size-5" />
                </IconCircle>
              </div>
              <div className="flex items-center gap-1">
                <IconCircle ref={lineaRef} label="Linea" size="xs">
                  <NetworkLinea variant="mono" className="size-5" />
                </IconCircle>
                <IconCircle ref={ethHubRef} label="Ethereum" size="lg" className="mx-1">
                  <NetworkEthereum variant="branded" className="size-9" />
                </IconCircle>
                <IconCircle ref={polyRef} label="Polygon" size="xs">
                  <NetworkPolygon variant="branded" className="size-5" />
                </IconCircle>
              </div>
              {/* Outer L2s - with dashed connections to ETH */}
              <div className="flex items-center gap-1">
                <IconCircle ref={gnosisRef} label="Gnosis" size="xs">
                  <NetworkGnosis variant="branded" className="size-5" />
                </IconCircle>
                <IconCircle ref={celoRef} label="Celo" size="xs">
                  <NetworkCelo variant="branded" className="size-5" />
                </IconCircle>
                <IconCircle ref={inkRef} label="Ink" size="xs">
                  <Droplets className="size-4 text-pink-500" />
                </IconCircle>
                <IconCircle ref={worldRef} label="World Chain" size="xs">
                  <CircleDot className="size-4 text-black dark:text-white" />
                </IconCircle>
              </div>
              {/* Static connections inside the container */}
              <StaticConnection containerRef={ethEcosystemRef} fromRef={ethHubRef} toRef={opRef} />
              <StaticConnection containerRef={ethEcosystemRef} fromRef={ethHubRef} toRef={arbRef} />
              <StaticConnection
                containerRef={ethEcosystemRef}
                fromRef={ethHubRef}
                toRef={zkSyncRef}
              />
              <StaticConnection
                containerRef={ethEcosystemRef}
                fromRef={ethHubRef}
                toRef={lineaRef}
              />
              <StaticConnection
                containerRef={ethEcosystemRef}
                fromRef={ethHubRef}
                toRef={polyRef}
              />
              <StaticConnection
                containerRef={ethEcosystemRef}
                fromRef={ethHubRef}
                toRef={gnosisRef}
              />
              <StaticConnection
                containerRef={ethEcosystemRef}
                fromRef={ethHubRef}
                toRef={celoRef}
              />
              <StaticConnection containerRef={ethEcosystemRef} fromRef={ethHubRef} toRef={inkRef} />
              <StaticConnection
                containerRef={ethEcosystemRef}
                fromRef={ethHubRef}
                toRef={worldRef}
              />
            </GroupContainer>

            {/* EVM Chains Container */}
            <GroupContainer
              ref={evmChainsRef}
              rightAnchorRef={evmRightAnchorRef}
              label={showLabels ? 'EVM Chains' : undefined}
              labelTooltip="EVM-compatible Layer 1 blockchains that can execute Ethereum smart contracts. Each has its own consensus and security model."
            >
              <div className="flex items-center gap-2">
                <IconCircle label="BNB Chain" size="sm">
                  <NetworkBinanceSmartChain variant="branded" className="size-6" />
                </IconCircle>
                <IconCircle label="Avalanche" size="sm">
                  <NetworkAvalanche variant="branded" className="size-6" />
                </IconCircle>
                <IconCircle label="Fantom" size="sm">
                  <NetworkFantom variant="branded" className="size-6" />
                </IconCircle>
              </div>
            </GroupContainer>

            {/* Non-EVM Container */}
            <GroupContainer
              ref={nonEvmRef}
              rightAnchorRef={nonEvmRightAnchorRef}
              label={showLabels ? 'Non-EVM' : undefined}
              labelTooltip="Blockchains with their own virtual machines and address formats. CAIP-10 standard enables tracking these alongside EVM chains in one registry."
            >
              <div className="flex items-center gap-2">
                <IconCircle label="Solana" size="sm">
                  <NetworkSolana variant="branded" className="size-6" />
                </IconCircle>
                <IconCircle label="NEAR Protocol" size="sm">
                  <NetworkNearProtocol variant="branded" className="size-6" />
                </IconCircle>
                <IconCircle label="Cosmos Hub" size="sm">
                  <NetworkCosmosHub variant="branded" className="size-6" />
                </IconCircle>
              </div>
            </GroupContainer>

            {/* Bitcoin Container */}
            <GroupContainer
              ref={btcRef}
              rightAnchorRef={btcRightAnchorRef}
              label={showLabels ? 'Bitcoin' : undefined}
              labelTooltip="The original blockchain. Bitcoin addresses use bip122 format but are fully supported via CAIP-10 compliant storage."
            >
              <IconCircle label="Bitcoin" size="md">
                <NetworkBitcoin variant="branded" className="size-7" />
              </IconCircle>
            </GroupContainer>
          </div>

          {/* MIDDLE SECTION: Bridges + Operators stacked */}
          <div className="flex flex-col items-center gap-4">
            {/* MESSAGING CLUSTER Container */}
            <GroupContainer
              ref={bridgesClusterRef}
              leftAnchorRef={bridgesLeftAnchorRef}
              rightAnchorRef={bridgesRightAnchorRef}
              label={showLabels ? 'Cross-Chain Messaging' : undefined}
              labelTooltip="Cross-chain messaging protocols that securely transmit CAIP-10 compliant stolen wallet reports from any source chain to the consolidated registry on Base. These protocols verify message authenticity and ensure data integrity across chains."
            >
              <div className="flex flex-col gap-2">
                <BridgeIcon label="Chainlink CCIP">
                  <TokenLINK className="size-5" />
                </BridgeIcon>
                <BridgeIcon label="Wormhole">
                  <WormholeLogo className="size-5 text-purple-500" />
                </BridgeIcon>
                <BridgeIcon label="Hyperlane">
                  <HyperlaneLogo className="size-5" />
                </BridgeIcon>
              </div>
            </GroupContainer>

            {/* OPERATORS CLUSTER Container - below bridges */}
            <GroupContainer
              ref={operatorsClusterRef}
              rightAnchorRef={operatorsTopAnchorRef}
              label={showLabels ? 'Trusted Operators' : undefined}
              labelTooltip="DAO-approved entities with elevated registry access. Operators can batch-submit stolen wallet reports on behalf of victims, aggregate intelligence from multiple sources, and provide higher-trust attestations. Examples include exchanges, security firms, and blockchain forensics companies."
            >
              <div className="flex items-center gap-2">
                <IconCircle label="Coinbase (Operator)" size="xs">
                  <ExchangeCoinbase className="size-5" />
                </IconCircle>
                <IconCircle label="Kraken (Operator)" size="xs">
                  <ExchangeKraken className="size-5" />
                </IconCircle>
                <IconCircle label="Chainalysis" size="xs">
                  <ChainalysisLogo className="text-orange-500" />
                </IconCircle>
                <IconCircle label="SEAL Team" size="xs">
                  <SealTeamLogo className="text-red-600" />
                </IconCircle>
              </div>
            </GroupContainer>
          </div>

          {/* CENTER: Registry Hub - positioned above center for better beam alignment */}
          <div className="relative flex flex-col items-center justify-center -mt-24">
            {/* Emission container - positioned above the title */}
            <div className="relative mb-2 flex min-h-[80px] items-end justify-center">
              <Caip10Emission triggerEmission={state.triggerEmission} />
            </div>
            <RegistryHub
              ref={hubRef}
              logoRef={hubLogoRef}
              leftAnchorRef={hubLeftAnchorRef}
              rightAnchorRef={hubRightAnchorRef}
              bottomAnchorRef={hubBottomAnchorRef}
              showLabels={showLabels}
            />
          </div>

          {/* RIGHT SIDE: Consumers */}
          <div className="flex w-36 flex-col items-center gap-4 md:w-44 md:gap-5 lg:w-48 lg:gap-6">
            {showLabels && (
              <SectionTitle
                title="React to Events"
                tooltip="Exchanges, wallets, and security services subscribe to registry events. When a stolen wallet is reported, they receive real-time alerts and can take protective action - blocking withdrawals, flagging transactions, or warning users before they send to compromised addresses."
              />
            )}

            {/* Exchanges */}
            <GroupContainer
              ref={exchangesContainerRef}
              leftAnchorRef={exchangesLeftAnchorRef}
              label={showLabels ? 'Exchanges' : undefined}
              labelTooltip="Centralized exchanges that can block withdrawals to flagged wallets, freeze suspicious deposits, and prevent stolen funds from being liquidated."
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                <IconCircle label="Coinbase" size="sm" triggerPulse={state.pulseListeners}>
                  <ExchangeCoinbase className="size-6" />
                </IconCircle>
                <IconCircle label="Kraken" size="sm" triggerPulse={state.pulseListeners}>
                  <ExchangeKraken className="size-6" />
                </IconCircle>
                <IconCircle label="Gemini" size="sm" triggerPulse={state.pulseListeners}>
                  <ExchangeGemini className="size-6" />
                </IconCircle>
                <IconCircle label="Binance" size="sm" triggerPulse={state.pulseListeners}>
                  <ExchangeBinance className="size-6" />
                </IconCircle>
              </div>
            </GroupContainer>

            {/* Wallets */}
            <GroupContainer
              ref={walletsContainerRef}
              leftAnchorRef={walletsLeftAnchorRef}
              label={showLabels ? 'Wallets' : undefined}
              labelTooltip="Self-custody wallets that can warn users before sending to flagged addresses or display alerts about compromised wallets in their contact lists."
            >
              <div className="flex items-center gap-2">
                <IconCircle label="MetaMask" size="sm" triggerPulse={state.pulseListeners}>
                  <WalletMetamask className="size-6" />
                </IconCircle>
                <IconCircle label="Rainbow" size="sm" triggerPulse={state.pulseListeners}>
                  <WalletRainbow className="size-6" />
                </IconCircle>
                <IconCircle label="Coinbase Wallet" size="sm" triggerPulse={state.pulseListeners}>
                  <WalletCoinbase className="size-6" />
                </IconCircle>
              </div>
            </GroupContainer>

            {/* Security Services */}
            <GroupContainer
              ref={securityContainerRef}
              leftAnchorRef={securityLeftAnchorRef}
              label={showLabels ? 'Security' : undefined}
              labelTooltip="Security firms and blockchain forensics companies that monitor stolen wallet reports to enhance their threat intelligence and help recover stolen assets."
            >
              <div className="flex items-center gap-2">
                <IconCircle label="Chainalysis" size="sm" triggerPulse={state.pulseListeners}>
                  <ChainalysisLogo className="text-orange-500" />
                </IconCircle>
                <IconCircle label="SEAL Team" size="sm" triggerPulse={state.pulseListeners}>
                  <SealTeamLogo className="text-red-600" />
                </IconCircle>
                <IconCircle label="Security Firm" size="sm" triggerPulse={state.pulseListeners}>
                  <Shield className="size-5 text-green-500" />
                </IconCircle>
              </div>
            </GroupContainer>
          </div>

          {/* ===== ANIMATED BEAMS (State Machine Controlled) ===== */}

          {/* PHASE 1: Network containers → Bridges (one fires per cycle) - ALL TEAL */}
          {/* NOTE: No onComplete props - timing is managed centrally via stepTimerRef */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={ethRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={-25}
            duration={effectiveBeamDuration}
            gradientStartColor="#14b8a6"
            gradientStopColor="#5eead4"
            pathColor="#14b8a6"
            pathOpacity={0.2}
            pathWidth={3}
            isActive={state.activeBeams.has('ethEcosystem')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={evmRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={0}
            duration={effectiveBeamDuration}
            gradientStartColor="#14b8a6"
            gradientStopColor="#5eead4"
            pathColor="#14b8a6"
            pathOpacity={0.2}
            pathWidth={3}
            isActive={state.activeBeams.has('evmChains')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={nonEvmRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={20}
            duration={effectiveBeamDuration}
            gradientStartColor="#14b8a6"
            gradientStopColor="#5eead4"
            pathColor="#14b8a6"
            pathOpacity={0.2}
            pathWidth={3}
            isActive={state.activeBeams.has('nonEvm')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={btcRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={40}
            duration={effectiveBeamDuration}
            gradientStartColor="#22c55e"
            gradientStopColor="#4ade80"
            pathColor="#22c55e"
            pathOpacity={0.2}
            pathWidth={3}
            isActive={state.activeBeams.has('btc')}
          />

          {/* PHASE 2: Bridges → Hub (Report Fraud flow) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={bridgesRightAnchorRef}
            toRef={hubLeftAnchorRef}
            curvature={0}
            duration={effectiveBeamDuration}
            gradientStartColor="#14b8a6"
            gradientStopColor="#3b82f6"
            pathColor="#14b8a6"
            pathOpacity={0.25}
            pathWidth={4}
            isActive={state.activeBeams.has('bridgesToHub')}
          />

          {/* Operators → Hub (Trusted Operators flow) - Amber color */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={operatorsTopAnchorRef}
            toRef={hubLeftAnchorRef}
            curvature={30}
            duration={effectiveBeamDuration}
            gradientStartColor="#f59e0b"
            gradientStopColor="#fbbf24"
            pathColor="#f59e0b"
            pathOpacity={0.25}
            pathWidth={4}
            isActive={state.activeBeams.has('operatorToHub')}
          />

          {/* PHASE 3: Hub → Consumer containers (all fire simultaneously) - ALL BLUE */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={exchangesLeftAnchorRef}
            curvature={-20}
            duration={effectiveBeamDuration}
            gradientStartColor="#3b82f6"
            gradientStopColor="#60a5fa"
            pathColor="#3b82f6"
            pathOpacity={0.25}
            pathWidth={3}
            isActive={state.activeBeams.has('exchanges')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={walletsLeftAnchorRef}
            curvature={20}
            duration={effectiveBeamDuration}
            gradientStartColor="#3b82f6"
            gradientStopColor="#60a5fa"
            pathColor="#3b82f6"
            pathOpacity={0.25}
            pathWidth={3}
            isActive={state.activeBeams.has('wallets')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={securityLeftAnchorRef}
            curvature={40}
            duration={effectiveBeamDuration}
            gradientStartColor="#3b82f6"
            gradientStopColor="#60a5fa"
            pathColor="#3b82f6"
            pathOpacity={0.25}
            pathWidth={3}
            isActive={state.activeBeams.has('security')}
          />
        </div>

        {/* DEV CONTROLS - Only visible in development, below visualization */}
        {DEV_MODE && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-yellow-500/50 bg-yellow-50/50 p-2 dark:bg-yellow-950/10">
            <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">DEV</span>
            <span className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1 font-mono text-[10px]">
                {state.currentStep}
              </code>
            </span>
            <button
              type="button"
              onClick={() => triggerReportFraud(0)}
              className="rounded bg-purple-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-purple-600"
            >
              ETH→
            </button>
            <button
              type="button"
              onClick={() => triggerReportFraud(1)}
              className="rounded bg-purple-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-purple-600"
            >
              EVM→
            </button>
            <button
              type="button"
              onClick={() => triggerTrustedOperators()}
              className="rounded bg-green-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-600"
            >
              Operators→
            </button>
            <label className="flex items-center gap-1 text-[10px]">
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="size-2.5"
              />
              Fast
            </label>
            <label className="flex items-center gap-1 text-[10px]">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(e) => {
                  setAutoPlay(e.target.checked);
                  if (e.target.checked) hasStartedRef.current = false;
                }}
                className="size-2.5"
              />
              Auto
            </label>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
