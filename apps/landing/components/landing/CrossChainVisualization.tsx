'use client';

import React, { forwardRef, useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  AnimatedBeam,
  cn,
  // Network icons - L2s
  NetworkEthereum,
  NetworkBase,
  NetworkOptimism,
  NetworkArbitrumOne,
  NetworkPolygon,
  NetworkZksync,
  NetworkScroll,
  NetworkLinea,
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
import { Link2, Globe } from 'lucide-react';

// Shared animation config for synchronized timing
const BEAM_DURATION = 3;
const PHASE_1_START = 0;
const PHASE_2_START = 2;

// Icon wrapper with optional pulse animation
const IconCircle = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children: React.ReactNode;
    label?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    pulse?: boolean;
    pulseDelay?: number;
  }
>(({ className, children, label, size = 'md', pulse = false, pulseDelay = 0 }, ref) => {
  const sizeClasses = {
    xs: 'size-8 p-1',
    sm: 'size-10 p-1.5',
    md: 'size-12 p-2',
    lg: 'size-14 p-2.5',
  };

  return (
    <motion.div
      ref={ref}
      className={cn(
        'relative z-10 flex items-center justify-center rounded-full border-2 border-border bg-background shadow-md transition-transform hover:scale-110',
        sizeClasses[size],
        className
      )}
      title={label}
      animate={
        pulse
          ? {
              boxShadow: [
                '0 0 0 0 rgba(34, 197, 94, 0)',
                '0 0 0 8px rgba(34, 197, 94, 0.3)',
                '0 0 0 0 rgba(34, 197, 94, 0)',
              ],
            }
          : {}
      }
      transition={
        pulse
          ? {
              duration: 1.5,
              repeat: Infinity,
              delay: pulseDelay,
              repeatDelay: BEAM_DURATION - 1.5,
            }
          : {}
      }
    >
      {children}
    </motion.div>
  );
});
IconCircle.displayName = 'IconCircle';

// Bridge icon wrapper (smaller, subtle)
const BridgeIcon = forwardRef<
  HTMLDivElement,
  { className?: string; children: React.ReactNode; label?: string }
>(({ className, children, label }, ref) => (
  <div
    ref={ref}
    className={cn(
      'z-10 flex size-8 items-center justify-center rounded-full border border-border/50 bg-background/50 p-1.5 opacity-70',
      className
    )}
    title={label}
  >
    {children}
  </div>
));
BridgeIcon.displayName = 'BridgeIcon';

// Central registry hub (no contract icon, just Base)
const RegistryHub = forwardRef<HTMLDivElement, { className?: string }>(({ className }, ref) => (
  <div ref={ref} className={cn('relative z-20 flex flex-col items-center', className)}>
    <div className="flex size-24 items-center justify-center rounded-full border-4 border-blue-500 bg-blue-950/50 shadow-lg shadow-blue-500/20">
      <NetworkBase className="size-12" />
    </div>
    <div className="mt-3 text-center">
      <div className="text-sm font-bold text-foreground">Stolen Wallet</div>
      <div className="text-sm font-bold text-foreground">Registry</div>
      <div className="mt-1 text-xs text-muted-foreground">CAIP-10 Compliant</div>
    </div>
  </div>
));
RegistryHub.displayName = 'RegistryHub';

// Cluster wrapper
const Cluster = forwardRef<
  HTMLDivElement,
  { className?: string; children: React.ReactNode; label?: string }
>(({ className, children, label }, ref) => (
  <div ref={ref} className={cn('relative flex flex-col items-center gap-2', className)}>
    <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
    {label && <span className="text-xs text-muted-foreground">{label}</span>}
  </div>
));
Cluster.displayName = 'Cluster';

// Static connection line (for ETH ↔ L2 relationships)
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

    updatePath();
    window.addEventListener('resize', updatePath);
    return () => window.removeEventListener('resize', updatePath);
  }, [containerRef, fromRef, toRef]);

  return (
    <svg className="pointer-events-none absolute inset-0 z-0">
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={1}
        strokeOpacity={0.2}
        strokeDasharray="4 4"
      />
    </svg>
  );
}

export interface CrossChainVisualizationProps {
  className?: string;
  showHeader?: boolean;
  showLabels?: boolean;
}

export function CrossChainVisualization({
  className,
  showHeader = true,
  showLabels = true,
}: CrossChainVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);

  // ETH L1 and L2s
  const ethHubRef = useRef<HTMLDivElement>(null);
  const opRef = useRef<HTMLDivElement>(null);
  const arbRef = useRef<HTMLDivElement>(null);
  const polyRef = useRef<HTMLDivElement>(null);
  const zkSyncRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineaRef = useRef<HTMLDivElement>(null);

  // Other L1s
  const solRef = useRef<HTMLDivElement>(null);
  const bnbRef = useRef<HTMLDivElement>(null);
  const avaxRef = useRef<HTMLDivElement>(null);
  const ftmRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);
  const cosmosRef = useRef<HTMLDivElement>(null);

  // Bitcoin
  const btcRef = useRef<HTMLDivElement>(null);

  // Bridges
  const chainlinkRef = useRef<HTMLDivElement>(null);
  const wormholeRef = useRef<HTMLDivElement>(null);
  const layerzeroRef = useRef<HTMLDivElement>(null);

  // Consumers
  const coinbaseRef = useRef<HTMLDivElement>(null);
  const krakenRef = useRef<HTMLDivElement>(null);
  const geminiRef = useRef<HTMLDivElement>(null);
  const binanceRef = useRef<HTMLDivElement>(null);
  const metamaskRef = useRef<HTMLDivElement>(null);
  const rainbowRef = useRef<HTMLDivElement>(null);
  const cbWalletRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      {showHeader && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Cross-Chain Fraud Intelligence</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Stolen wallets and fraudulent transactions reported from any chain settle to a unified
            registry on Base. Exchanges, wallets, and security services query the registry in
            real-time to protect users.
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative flex h-[600px] w-full max-w-[1200px] items-center justify-between px-4"
      >
        {/* LEFT SIDE: Networks */}
        <div className="flex w-56 flex-col items-center gap-6">
          {showLabels && (
            <div className="text-center text-xs font-medium text-muted-foreground">
              Report Fraud
            </div>
          )}

          {/* ETH L1 + L2s cluster */}
          <div className="relative flex flex-col items-center">
            {/* Top row of L2s */}
            <div className="flex items-center gap-1">
              <IconCircle ref={opRef} label="Optimism" size="xs">
                <NetworkOptimism className="size-5" />
              </IconCircle>
              <IconCircle ref={arbRef} label="Arbitrum" size="xs">
                <NetworkArbitrumOne className="size-5" />
              </IconCircle>
              <IconCircle ref={zkSyncRef} label="zkSync" size="xs">
                <NetworkZksync className="size-5" />
              </IconCircle>
            </div>

            {/* ETH in center */}
            <div className="my-1 flex items-center gap-1">
              <IconCircle ref={lineaRef} label="Linea" size="xs">
                <NetworkLinea className="size-5" />
              </IconCircle>
              <IconCircle ref={ethHubRef} label="Ethereum" size="lg" className="mx-1">
                <NetworkEthereum className="size-9" />
              </IconCircle>
              <IconCircle ref={scrollRef} label="Scroll" size="xs">
                <NetworkScroll className="size-5" />
              </IconCircle>
            </div>

            {/* Bottom L2 */}
            <IconCircle ref={polyRef} label="Polygon" size="xs">
              <NetworkPolygon className="size-5" />
            </IconCircle>

            {showLabels && (
              <span className="mt-2 text-xs text-muted-foreground">Ethereum Ecosystem</span>
            )}
          </div>

          {/* Other L1s */}
          <Cluster label={showLabels ? 'EVM Chains' : undefined}>
            <IconCircle ref={bnbRef} label="BNB Chain" size="sm">
              <NetworkBinanceSmartChain className="size-6" />
            </IconCircle>
            <IconCircle ref={avaxRef} label="Avalanche" size="sm">
              <NetworkAvalanche className="size-6" />
            </IconCircle>
            <IconCircle ref={ftmRef} label="Fantom" size="sm">
              <NetworkFantom className="size-6" />
            </IconCircle>
          </Cluster>

          {/* Non-EVM chains */}
          <Cluster label={showLabels ? 'Non-EVM' : undefined}>
            <IconCircle ref={solRef} label="Solana" size="sm">
              <NetworkSolana className="size-6" />
            </IconCircle>
            <IconCircle ref={nearRef} label="Near" size="sm">
              <NetworkNearProtocol className="size-6" />
            </IconCircle>
            <IconCircle ref={cosmosRef} label="Cosmos" size="sm">
              <NetworkCosmosHub className="size-6" />
            </IconCircle>
          </Cluster>

          {/* Bitcoin */}
          <div className="flex flex-col items-center">
            <IconCircle ref={btcRef} label="Bitcoin" size="md">
              <NetworkBitcoin className="size-7" />
            </IconCircle>
            {showLabels && <span className="mt-1 text-xs text-muted-foreground">Bitcoin</span>}
          </div>
        </div>

        {/* CENTER: Registry Hub with Bridges */}
        <div className="relative flex flex-col items-center">
          {/* Bridges around the hub */}
          <div className="absolute -left-12 top-1/2 flex -translate-y-1/2 flex-col gap-2">
            <BridgeIcon ref={chainlinkRef} label="Chainlink CCIP">
              <TokenLINK className="size-5" />
            </BridgeIcon>
          </div>
          <div className="absolute -right-12 top-1/2 flex -translate-y-1/2 flex-col gap-2">
            <BridgeIcon ref={wormholeRef} label="Wormhole">
              <Globe className="size-4 text-purple-400" />
            </BridgeIcon>
          </div>
          <div className="absolute -top-10 left-1/2 -translate-x-1/2">
            <BridgeIcon ref={layerzeroRef} label="LayerZero">
              <Link2 className="size-4 text-blue-400" />
            </BridgeIcon>
          </div>

          <RegistryHub ref={hubRef} />
        </div>

        {/* RIGHT SIDE: Consumers */}
        <div className="flex w-48 flex-col items-center gap-8">
          {showLabels && (
            <div className="text-center text-xs font-medium text-muted-foreground">
              Query Registry
            </div>
          )}

          {/* Exchanges */}
          <Cluster label={showLabels ? 'Exchanges' : undefined}>
            <IconCircle
              ref={coinbaseRef}
              label="Coinbase"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START}
            >
              <ExchangeCoinbase className="size-6" />
            </IconCircle>
            <IconCircle
              ref={krakenRef}
              label="Kraken"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START + 0.2}
            >
              <ExchangeKraken className="size-6" />
            </IconCircle>
            <IconCircle
              ref={geminiRef}
              label="Gemini"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START + 0.4}
            >
              <ExchangeGemini className="size-6" />
            </IconCircle>
            <IconCircle
              ref={binanceRef}
              label="Binance"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START + 0.6}
            >
              <ExchangeBinance className="size-6" />
            </IconCircle>
          </Cluster>

          {/* Wallets */}
          <Cluster label={showLabels ? 'Wallets' : undefined}>
            <IconCircle
              ref={metamaskRef}
              label="MetaMask"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START + 0.8}
            >
              <WalletMetamask className="size-6" />
            </IconCircle>
            <IconCircle
              ref={rainbowRef}
              label="Rainbow"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START + 1.0}
            >
              <WalletRainbow className="size-6" />
            </IconCircle>
            <IconCircle
              ref={cbWalletRef}
              label="Coinbase Wallet"
              size="sm"
              pulse
              pulseDelay={PHASE_2_START + 1.2}
            >
              <WalletCoinbase className="size-6" />
            </IconCircle>
          </Cluster>
        </div>

        {/* Static connections: ETH ↔ L2s */}
        <StaticConnection containerRef={containerRef} fromRef={ethHubRef} toRef={opRef} />
        <StaticConnection containerRef={containerRef} fromRef={ethHubRef} toRef={arbRef} />
        <StaticConnection containerRef={containerRef} fromRef={ethHubRef} toRef={zkSyncRef} />
        <StaticConnection containerRef={containerRef} fromRef={ethHubRef} toRef={lineaRef} />
        <StaticConnection containerRef={containerRef} fromRef={ethHubRef} toRef={scrollRef} />
        <StaticConnection containerRef={containerRef} fromRef={ethHubRef} toRef={polyRef} />

        {/* Static connections: Bridges ↔ Hub */}
        <StaticConnection containerRef={containerRef} fromRef={chainlinkRef} toRef={hubRef} />
        <StaticConnection containerRef={containerRef} fromRef={wormholeRef} toRef={hubRef} />
        <StaticConnection containerRef={containerRef} fromRef={layerzeroRef} toRef={hubRef} />

        {/* ===== ANIMATED BEAMS ===== */}

        {/* PHASE 1: Networks → Registry */}
        {/* ETH ecosystem */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={ethHubRef}
          toRef={hubRef}
          curvature={0}
          duration={BEAM_DURATION}
          delay={PHASE_1_START}
          gradientStartColor="#627eea"
          gradientStopColor="#0052ff"
          pathColor="#627eea"
          pathOpacity={0.15}
        />

        {/* EVM chains */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={bnbRef}
          toRef={hubRef}
          curvature={-20}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.2}
          gradientStartColor="#f0b90b"
          gradientStopColor="#0052ff"
          pathColor="#f0b90b"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={avaxRef}
          toRef={hubRef}
          curvature={-10}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.3}
          gradientStartColor="#e84142"
          gradientStopColor="#0052ff"
          pathColor="#e84142"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={ftmRef}
          toRef={hubRef}
          curvature={0}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.4}
          gradientStartColor="#1969ff"
          gradientStopColor="#0052ff"
          pathColor="#1969ff"
          pathOpacity={0.15}
        />

        {/* Non-EVM */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={solRef}
          toRef={hubRef}
          curvature={10}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.5}
          gradientStartColor="#9945ff"
          gradientStopColor="#0052ff"
          pathColor="#9945ff"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={nearRef}
          toRef={hubRef}
          curvature={20}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.6}
          gradientStartColor="#00c08b"
          gradientStopColor="#0052ff"
          pathColor="#00c08b"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={cosmosRef}
          toRef={hubRef}
          curvature={30}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.7}
          gradientStartColor="#2e3148"
          gradientStopColor="#0052ff"
          pathColor="#6f7390"
          pathOpacity={0.15}
        />

        {/* Bitcoin */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={btcRef}
          toRef={hubRef}
          curvature={40}
          duration={BEAM_DURATION}
          delay={PHASE_1_START + 0.8}
          gradientStartColor="#f7931a"
          gradientStopColor="#0052ff"
          pathColor="#f7931a"
          pathOpacity={0.15}
        />

        {/* PHASE 2: Registry → Consumers (curves inward) */}
        {/* Exchanges */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={coinbaseRef}
          curvature={40}
          duration={BEAM_DURATION}
          delay={PHASE_2_START}
          gradientStartColor="#0052ff"
          gradientStopColor="#0052ff"
          pathColor="#0052ff"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={krakenRef}
          curvature={25}
          duration={BEAM_DURATION}
          delay={PHASE_2_START + 0.2}
          gradientStartColor="#0052ff"
          gradientStopColor="#5741d9"
          pathColor="#5741d9"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={geminiRef}
          curvature={10}
          duration={BEAM_DURATION}
          delay={PHASE_2_START + 0.4}
          gradientStartColor="#0052ff"
          gradientStopColor="#00dcfa"
          pathColor="#00dcfa"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={binanceRef}
          curvature={-5}
          duration={BEAM_DURATION}
          delay={PHASE_2_START + 0.6}
          gradientStartColor="#0052ff"
          gradientStopColor="#f0b90b"
          pathColor="#f0b90b"
          pathOpacity={0.15}
        />

        {/* Wallets */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={metamaskRef}
          curvature={-20}
          duration={BEAM_DURATION}
          delay={PHASE_2_START + 0.8}
          gradientStartColor="#0052ff"
          gradientStopColor="#e2761b"
          pathColor="#e2761b"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={rainbowRef}
          curvature={-35}
          duration={BEAM_DURATION}
          delay={PHASE_2_START + 1.0}
          gradientStartColor="#0052ff"
          gradientStopColor="#ff6b6b"
          pathColor="#ff6b6b"
          pathOpacity={0.15}
        />
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={hubRef}
          toRef={cbWalletRef}
          curvature={-50}
          duration={BEAM_DURATION}
          delay={PHASE_2_START + 1.2}
          gradientStartColor="#0052ff"
          gradientStopColor="#0052ff"
          pathColor="#0052ff"
          pathOpacity={0.15}
        />
      </div>
    </div>
  );
}
