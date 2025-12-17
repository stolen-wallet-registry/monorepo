'use client';

import { motion } from 'motion/react';
import { Globe, Shield, ChevronDown } from 'lucide-react';
import {
  cn,
  TooltipProvider,
  NetworkEthereum,
  NetworkBase,
  NetworkArbitrumOne,
  NetworkBitcoin,
  NetworkAvalanche,
  ExchangeCoinbase,
  ExchangeKraken,
  WalletMetamask,
  TokenLINK,
} from '@swr/ui';

import {
  IconCircle,
  BridgeIcon,
  HyperlaneLogo,
  MobileSection,
  MobileRegistryHub,
  SealTeamLogo,
} from './shared';

import type { CrossChainVisualizationProps } from './types';

// Animated arrow connector for mobile layout (purely decorative)
function ArrowConnector() {
  return (
    <motion.div
      className="flex flex-col items-center py-1"
      aria-hidden="true"
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ChevronDown className="size-5 text-muted-foreground" />
    </motion.div>
  );
}

// Mobile visualization - vertical stacked layout
export function CrossChainVisualizationMobile({
  className,
  showHeader = true,
  showLabels = true,
}: CrossChainVisualizationProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn('flex flex-col items-center gap-4 px-4', className)}>
        {showHeader && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">One Data Registry, Every Chain.</h2>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Aggregates reports using{' '}
              <a
                href="https://chainagnostic.org/CAIPs/caip-10"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline decoration-dotted underline-offset-2"
              >
                CAIP-10
              </a>{' '}
              chain-agnostic identifiers. Services react in real-time to protect the ecosystem.
            </p>
          </div>
        )}

        {/* Networks - representative icons */}
        <MobileSection
          label={showLabels ? 'Report Fraud' : undefined}
          tooltip="Report stolen wallets or fraudulent transactions. Self-attestation requires proving wallet ownership via cryptographic signature."
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <IconCircle label="Ethereum" size="sm">
              <NetworkEthereum variant="branded" className="size-6" />
            </IconCircle>
            <IconCircle label="Arbitrum" size="sm">
              <NetworkArbitrumOne variant="branded" className="size-6" />
            </IconCircle>
            <IconCircle label="Bitcoin" size="sm">
              <NetworkBitcoin variant="branded" className="size-6" />
            </IconCircle>
            <IconCircle label="Base" size="sm">
              <NetworkBase variant="branded" className="size-6" />
            </IconCircle>
            <IconCircle label="Avalanche" size="sm">
              <NetworkAvalanche variant="branded" className="size-6" />
            </IconCircle>
          </div>
          <span className="text-[10px] text-muted-foreground">+ 15 more chains supported</span>
        </MobileSection>

        <ArrowConnector />

        {/* Cross-Chain Messaging */}
        <MobileSection
          label={showLabels ? 'Cross-Chain Messaging' : undefined}
          tooltip="Cross-chain messaging protocols securely transmit reports from any chain to the consolidated registry on Base."
        >
          <div className="flex items-center gap-3">
            <BridgeIcon label="Chainlink CCIP">
              <TokenLINK className="size-5" />
            </BridgeIcon>
            <BridgeIcon label="Wormhole">
              <Globe className="size-5 text-purple-500" />
            </BridgeIcon>
            <BridgeIcon label="Hyperlane">
              <HyperlaneLogo className="size-5" />
            </BridgeIcon>
          </div>
        </MobileSection>

        <ArrowConnector />

        {/* Registry Hub */}
        <MobileRegistryHub showLabels={showLabels} />

        <ArrowConnector />

        {/* Consumers - React to Events */}
        <MobileSection
          label={showLabels ? 'React to Events' : undefined}
          tooltip="Exchanges, wallets, and security services subscribe to registry events and take protective action in real-time."
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <IconCircle label="Coinbase" size="sm" pulse pulseDelay={0}>
              <ExchangeCoinbase className="size-6" />
            </IconCircle>
            <IconCircle label="MetaMask" size="sm" pulse pulseDelay={0.3}>
              <WalletMetamask className="size-6" />
            </IconCircle>
            <IconCircle label="Kraken" size="sm" pulse pulseDelay={0.6}>
              <ExchangeKraken className="size-6" />
            </IconCircle>
            <IconCircle label="SEAL Team" size="sm" pulse pulseDelay={0.9}>
              <SealTeamLogo className="text-red-600" />
            </IconCircle>
            <IconCircle label="Security" size="sm" pulse pulseDelay={1.2}>
              <Shield className="size-5 text-green-500" />
            </IconCircle>
          </div>
          <span className="text-[10px] text-muted-foreground">Exchanges, Wallets, Security</span>
        </MobileSection>
      </div>
    </TooltipProvider>
  );
}
