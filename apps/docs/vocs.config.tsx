import { defineConfig } from 'vocs';

export default defineConfig({
  rootDir: '.',
  aiCta: false,
  vite: {
    server: {
      port: 5174,
    },
  },
  title: 'Stolen Wallet Registry',
  description: 'Cross-chain fraud detection and transparency registry',
  logoUrl: '/logo.svg',
  iconUrl: '/favicon.ico',

  // GitHub integration
  editLink: {
    pattern: 'https://github.com/stolen-wallet-registry/monorepo/edit/main/apps/docs/pages/:path',
    text: 'Edit on GitHub',
  },

  // Sidebar navigation
  sidebar: [
    {
      text: 'Getting Started',
      items: [
        { text: 'Introduction', link: '/' },
        { text: 'Quick Start', link: '/getting-started/quick-start' },
      ],
    },
    {
      text: 'Core Concepts',
      items: [
        { text: 'Two-Phase Registration', link: '/concepts/two-phase-registration' },
        { text: 'CAIP Identifiers & Storage', link: '/concepts/caip-storage' },
        { text: 'Hub-Spoke Architecture', link: '/concepts/hub-spoke' },
      ],
    },
    {
      text: 'Registries',
      items: [
        { text: 'Wallet Registry', link: '/registries/wallet' },
        { text: 'Transaction Registry', link: '/registries/transaction' },
        { text: 'Contract Registry', link: '/registries/contract' },
      ],
    },
    {
      text: 'Operator Protocol',
      items: [
        { text: 'Overview', link: '/operator' },
        { text: 'Batch Submissions', link: '/operator/batch-submissions' },
        { text: 'Economics & Gas', link: '/operator/economics' },
      ],
    },
    {
      text: 'P2P Relay',
      items: [
        { text: 'How It Works', link: '/p2p' },
        { text: 'Protocol Deep-Dive', link: '/p2p/protocol' },
      ],
    },
    {
      text: 'Infrastructure',
      items: [
        { text: 'Fee Manager', link: '/infrastructure/fee-manager' },
        { text: 'Soulbound Tokens', link: '/infrastructure/soulbound' },
        { text: 'Indexer & Search', link: '/infrastructure/indexer' },
      ],
    },
    {
      text: 'Developer Guide',
      items: [
        { text: 'Local Setup', link: '/dev/setup' },
        { text: 'Deployed Contracts', link: '/dev/contracts' },
      ],
    },
    {
      text: 'Philosophy',
      items: [
        { text: 'Manifesto', link: '/philosophy/manifesto' },
        { text: 'Governance', link: '/philosophy/governance' },
      ],
    },
  ],

  // Social links
  socials: [
    {
      icon: 'github',
      link: 'https://github.com/stolen-wallet-registry/monorepo',
    },
  ],

  // Theme customization
  theme: {
    accentColor: '#3B82F6',
  },
});
