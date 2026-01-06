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

// ===== STATE MACHINE FOR BEAM ANIMATION =====

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
  completedListenerCount: number;
}

type AnimationAction =
  | { type: 'START_CYCLE'; flow: 'reportFraud' | 'trustedOperators'; networkIndex: number }
  | { type: 'BEAM_COMPLETE'; beamId: string }
  | { type: 'CYCLE_COMPLETE' }
  | { type: 'RESET_TRIGGERS' };

const initialState: AnimationState = {
  currentStep: 'idle',
  activeBeams: new Set(),
  pulseListeners: false,
  triggerEmission: false,
  selectedNetwork: 0,
  completedListenerCount: 0,
};

// Timing helper for logs
const getTimestamp = () => {
  const now = new Date();
  return `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
};

function animationReducer(state: AnimationState, action: AnimationAction): AnimationState {
  const ts = getTimestamp();

  switch (action.type) {
    case 'START_CYCLE': {
      const { flow, networkIndex } = action;

      if (flow === 'reportFraud') {
        const networkBeams = ['ethEcosystem', 'evmChains', 'nonEvm', 'btc'];
        const activeBeam = networkBeams[networkIndex];
        console.log(`[${ts}] 🚀 Report Fraud → LEFT beam: ${activeBeam}`);
        return {
          ...state,
          currentStep: 'rf_networkToBridges',
          activeBeams: new Set([activeBeam]),
          pulseListeners: false,
          triggerEmission: false,
          selectedNetwork: networkIndex,
          completedListenerCount: 0,
        };
      } else {
        console.log(`[${ts}] 🚀 Trusted Operators → operatorToHub`);
        return {
          ...state,
          currentStep: 'to_operatorToHub',
          activeBeams: new Set(['operatorToHub']),
          pulseListeners: false,
          triggerEmission: false,
          selectedNetwork: 0,
          completedListenerCount: 0,
        };
      }
    }

    case 'BEAM_COMPLETE': {
      const { beamId: completedBeam } = action;

      // Handle network beam completion -> trigger bridges to hub
      if (
        ['ethEcosystem', 'evmChains', 'nonEvm', 'btc'].includes(completedBeam) &&
        state.currentStep === 'rf_networkToBridges'
      ) {
        console.log(
          `[${ts}] ✅ LEFT beam done (${completedBeam}) → activating MIDDLE beam: bridgesToHub`
        );
        return {
          ...state,
          currentStep: 'rf_bridgesToHub',
          activeBeams: new Set(['bridgesToHub']),
        };
      }

      // Handle bridges to hub completion -> trigger all listeners
      if (completedBeam === 'bridgesToHub' && state.currentStep === 'rf_bridgesToHub') {
        console.log(`[${ts}] ✅ MIDDLE beam done → activating RIGHT beams + EMISSION`);
        return {
          ...state,
          currentStep: 'rf_hubToListeners',
          activeBeams: new Set(['exchanges', 'wallets', 'security']),
          pulseListeners: true,
          triggerEmission: true,
        };
      }

      // Handle operator to hub completion -> trigger all listeners
      if (completedBeam === 'operatorToHub' && state.currentStep === 'to_operatorToHub') {
        console.log(`[${ts}] ✅ OPERATOR beam done → activating RIGHT beams + EMISSION`);
        return {
          ...state,
          currentStep: 'to_hubToListeners',
          activeBeams: new Set(['exchanges', 'wallets', 'security']),
          pulseListeners: true,
          triggerEmission: true,
        };
      }

      // Handle listener beam completion
      if (
        ['exchanges', 'wallets', 'security'].includes(completedBeam) &&
        (state.currentStep === 'rf_hubToListeners' || state.currentStep === 'to_hubToListeners')
      ) {
        const newCount = state.completedListenerCount + 1;
        console.log(
          `[${ts}] ✅ RIGHT beam done (${completedBeam}) - ${newCount}/3 listeners complete`
        );
        if (newCount >= 3) {
          console.log(`[${ts}] 🏁 CYCLE COMPLETE → idle (waiting ${CYCLE_PAUSE}s)`);
          return {
            ...state,
            currentStep: 'idle',
            activeBeams: new Set(),
            completedListenerCount: 0,
          };
        }
        return {
          ...state,
          completedListenerCount: newCount,
        };
      }

      // Ignore stale beam completions (beam finished after state moved on)
      return state;
    }

    case 'RESET_TRIGGERS': {
      return {
        ...state,
        pulseListeners: false,
        triggerEmission: false,
      };
    }

    case 'CYCLE_COMPLETE': {
      return {
        ...state,
        currentStep: 'idle',
        activeBeams: new Set(),
        pulseListeners: false,
        triggerEmission: false,
        completedListenerCount: 0,
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

  // Memoized handlers for beam completion
  const handleBeamComplete = useCallback((beamId: string) => {
    dispatch({ type: 'BEAM_COMPLETE', beamId });
  }, []);

  // Track if we've started to prevent StrictMode double-fire
  const hasStartedRef = useRef(false);

  // Helper to create START_CYCLE action with random values
  const createStartCycleAction = useCallback((): AnimationAction => {
    const flow = Math.random() > 0.5 ? 'reportFraud' : 'trustedOperators';
    const networkIndex = Math.floor(Math.random() * 4);
    return { type: 'START_CYCLE', flow, networkIndex };
  }, []);

  // Start animation cycle and manage timing
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const ts = getTimestamp();
    console.log(`[${ts}] 🎬 Component mounted, starting first cycle in 500ms`);
    const action = createStartCycleAction();
    const initialTimeout = setTimeout(() => {
      dispatch(action);
    }, 500);

    return () => clearTimeout(initialTimeout);
  }, [createStartCycleAction]);

  // When cycle goes idle, start a new cycle after pause
  useEffect(() => {
    if (state.currentStep === 'idle' && hasStartedRef.current) {
      const action = createStartCycleAction();
      const pauseTimeout = setTimeout(() => {
        dispatch(action);
      }, CYCLE_PAUSE * 1000);

      return () => clearTimeout(pauseTimeout);
    }
  }, [state.currentStep, createStartCycleAction]);

  // Reset triggers after animation has time to detect transition
  useEffect(() => {
    if (state.pulseListeners || state.triggerEmission) {
      const resetTimeout = setTimeout(() => {
        dispatch({ type: 'RESET_TRIGGERS' });
      }, 500); // Was 100ms - increased to give React effects time to detect transition
      return () => clearTimeout(resetTimeout);
    }
  }, [state.pulseListeners, state.triggerEmission]);

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

          {/* CENTER: Registry Hub */}
          <div className="relative">
            <Caip10Emission triggerEmission={state.triggerEmission} />
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

          {/* PHASE 1: Network containers → Bridges (one fires per cycle) - ALL PURPLE */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={ethRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={-25}
            duration={BEAM_DURATION}
            gradientStartColor="#9945ff"
            gradientStopColor="#9945ff"
            pathColor="#9945ff"
            pathOpacity={0.3}
            isActive={state.activeBeams.has('ethEcosystem')}
            onComplete={() => handleBeamComplete('ethEcosystem')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={evmRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={0}
            duration={BEAM_DURATION}
            gradientStartColor="#9945ff"
            gradientStopColor="#9945ff"
            pathColor="#9945ff"
            pathOpacity={0.3}
            isActive={state.activeBeams.has('evmChains')}
            onComplete={() => handleBeamComplete('evmChains')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={nonEvmRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={20}
            duration={BEAM_DURATION}
            gradientStartColor="#9945ff"
            gradientStopColor="#9945ff"
            pathColor="#9945ff"
            pathOpacity={0.3}
            isActive={state.activeBeams.has('nonEvm')}
            onComplete={() => handleBeamComplete('nonEvm')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={btcRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={40}
            duration={BEAM_DURATION}
            gradientStartColor="#9945ff"
            gradientStopColor="#9945ff"
            pathColor="#9945ff"
            pathOpacity={0.3}
            isActive={state.activeBeams.has('btc')}
            onComplete={() => handleBeamComplete('btc')}
          />

          {/* PHASE 2: Bridges → Hub (Report Fraud flow) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={bridgesRightAnchorRef}
            toRef={hubLeftAnchorRef}
            curvature={0}
            duration={BEAM_DURATION}
            gradientStartColor="#9945ff"
            gradientStopColor="#0052ff"
            pathColor="#9945ff"
            pathOpacity={0.35}
            pathWidth={3}
            isActive={state.activeBeams.has('bridgesToHub')}
            onComplete={() => handleBeamComplete('bridgesToHub')}
          />

          {/* Operators → Hub (Trusted Operators flow) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={operatorsTopAnchorRef}
            toRef={hubLeftAnchorRef}
            curvature={30}
            duration={BEAM_DURATION}
            gradientStartColor="#22c55e"
            gradientStopColor="#0052ff"
            pathColor="#22c55e"
            pathOpacity={0.35}
            pathWidth={3}
            isActive={state.activeBeams.has('operatorToHub')}
            onComplete={() => handleBeamComplete('operatorToHub')}
          />

          {/* PHASE 3: Hub → Consumer containers (all fire simultaneously) - ALL BLUE */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={exchangesLeftAnchorRef}
            curvature={-20}
            duration={BEAM_DURATION}
            gradientStartColor="#0052ff"
            gradientStopColor="#0052ff"
            pathColor="#0052ff"
            pathOpacity={0.35}
            pathWidth={3}
            isActive={state.activeBeams.has('exchanges')}
            onComplete={() => handleBeamComplete('exchanges')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={walletsLeftAnchorRef}
            curvature={20}
            duration={BEAM_DURATION}
            gradientStartColor="#0052ff"
            gradientStopColor="#0052ff"
            pathColor="#0052ff"
            pathOpacity={0.35}
            pathWidth={3}
            isActive={state.activeBeams.has('wallets')}
            onComplete={() => handleBeamComplete('wallets')}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={securityLeftAnchorRef}
            curvature={40}
            duration={BEAM_DURATION}
            gradientStartColor="#0052ff"
            gradientStopColor="#0052ff"
            pathColor="#0052ff"
            pathOpacity={0.35}
            pathWidth={3}
            isActive={state.activeBeams.has('security')}
            onComplete={() => handleBeamComplete('security')}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
