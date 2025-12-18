'use client';

import { useRef, useEffect, useState } from 'react';
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
  PHASE_1_START,
  PHASE_2_START,
  PHASE_3_START,
  IconCircle,
  BridgeIcon,
  ChainalysisLogo,
  HyperlaneLogo,
  SealTeamLogo,
  WormholeLogo,
  GroupContainer,
  RegistryHub,
  SectionTitle,
} from './shared';

import type { CrossChainVisualizationProps } from './types';

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
          <RegistryHub
            ref={hubRef}
            logoRef={hubLogoRef}
            leftAnchorRef={hubLeftAnchorRef}
            rightAnchorRef={hubRightAnchorRef}
            bottomAnchorRef={hubBottomAnchorRef}
            showLabels={showLabels}
          />

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
                <IconCircle label="Coinbase" size="sm" pulse pulseDelay={PHASE_3_START}>
                  <ExchangeCoinbase className="size-6" />
                </IconCircle>
                <IconCircle label="Kraken" size="sm" pulse pulseDelay={PHASE_3_START + 0.2}>
                  <ExchangeKraken className="size-6" />
                </IconCircle>
                <IconCircle label="Gemini" size="sm" pulse pulseDelay={PHASE_3_START + 0.4}>
                  <ExchangeGemini className="size-6" />
                </IconCircle>
                <IconCircle label="Binance" size="sm" pulse pulseDelay={PHASE_3_START + 0.6}>
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
                <IconCircle label="MetaMask" size="sm" pulse pulseDelay={PHASE_3_START + 0.8}>
                  <WalletMetamask className="size-6" />
                </IconCircle>
                <IconCircle label="Rainbow" size="sm" pulse pulseDelay={PHASE_3_START + 1.0}>
                  <WalletRainbow className="size-6" />
                </IconCircle>
                <IconCircle
                  label="Coinbase Wallet"
                  size="sm"
                  pulse
                  pulseDelay={PHASE_3_START + 1.2}
                >
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
                <IconCircle label="Chainalysis" size="sm" pulse pulseDelay={PHASE_3_START + 1.4}>
                  <ChainalysisLogo className="text-orange-500" />
                </IconCircle>
                <IconCircle label="SEAL Team" size="sm" pulse pulseDelay={PHASE_3_START + 1.5}>
                  <SealTeamLogo className="text-red-600" />
                </IconCircle>
                <IconCircle label="Security Firm" size="sm" pulse pulseDelay={PHASE_3_START + 1.6}>
                  <Shield className="size-5 text-green-500" />
                </IconCircle>
              </div>
            </GroupContainer>
          </div>

          {/* ===== ANIMATED BEAMS ===== */}
          {/* Beams connect to edge anchors - no manual offsets needed */}

          {/* PHASE 1: Network containers → Bridges (from right edge to left edge) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={ethRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={-25}
            duration={BEAM_DURATION}
            delay={PHASE_1_START}
            gradientStartColor="#627eea"
            gradientStopColor="#9945ff"
            pathColor="#627eea"
            pathOpacity={0.15}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={evmRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={0}
            duration={BEAM_DURATION}
            delay={PHASE_1_START + 0.3}
            gradientStartColor="#f0b90b"
            gradientStopColor="#9945ff"
            pathColor="#f0b90b"
            pathOpacity={0.15}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={nonEvmRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={20}
            duration={BEAM_DURATION}
            delay={PHASE_1_START + 0.6}
            gradientStartColor="#9945ff"
            gradientStopColor="#9945ff"
            pathColor="#9945ff"
            pathOpacity={0.15}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={btcRightAnchorRef}
            toRef={bridgesLeftAnchorRef}
            curvature={40}
            duration={BEAM_DURATION}
            delay={PHASE_1_START + 0.9}
            gradientStartColor="#f7931a"
            gradientStopColor="#9945ff"
            pathColor="#f7931a"
            pathOpacity={0.15}
          />

          {/* PHASE 2: Bridges → Base Hub (from right edge to left edge) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={bridgesRightAnchorRef}
            toRef={hubLeftAnchorRef}
            curvature={0}
            duration={BEAM_DURATION}
            delay={PHASE_2_START}
            gradientStartColor="#9945ff"
            gradientStopColor="#0052ff"
            pathColor="#9945ff"
            pathOpacity={0.2}
            pathWidth={3}
          />

          {/* Operators → Hub (from right edge to hub left - horizontal) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={operatorsTopAnchorRef}
            toRef={hubLeftAnchorRef}
            curvature={30}
            duration={BEAM_DURATION}
            delay={PHASE_1_START + 0.5}
            gradientStartColor="#22c55e"
            gradientStopColor="#0052ff"
            pathColor="#22c55e"
            pathOpacity={0.2}
            pathWidth={3}
          />

          {/* PHASE 3: Hub → Consumer containers (from right edge to left edge) */}
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={exchangesLeftAnchorRef}
            curvature={-20}
            duration={BEAM_DURATION}
            delay={PHASE_3_START}
            gradientStartColor="#0052ff"
            gradientStopColor="#0052ff"
            pathColor="#0052ff"
            pathOpacity={0.2}
            pathWidth={3}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={walletsLeftAnchorRef}
            curvature={20}
            duration={BEAM_DURATION}
            delay={PHASE_3_START + 0.3}
            gradientStartColor="#0052ff"
            gradientStopColor="#e2761b"
            pathColor="#e2761b"
            pathOpacity={0.2}
            pathWidth={3}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={hubRightAnchorRef}
            toRef={securityLeftAnchorRef}
            curvature={40}
            duration={BEAM_DURATION}
            delay={PHASE_3_START + 0.6}
            gradientStartColor="#0052ff"
            gradientStopColor="#22c55e"
            pathColor="#22c55e"
            pathOpacity={0.2}
            pathWidth={3}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
