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
        { text: 'Quick Start', link: '/guide' },
      ],
    },
    {
      text: 'User Guides',
      items: [
        {
          text: 'Standard Registration',
          link: '/guide/registration-standard',
        },
        {
          text: 'Self-Relay Registration',
          link: '/guide/registration-self-relay',
        },
        { text: 'P2P Relay Registration', link: '/guide/registration-p2p-relay' },
        { text: 'Etherscan Walkthrough', link: '/guide/etherscan-walkthrough' },
      ],
    },
    {
      text: 'Philosophy',
      items: [
        { text: 'Overview', link: '/philosophy' },
        { text: 'Manifesto', link: '/philosophy/manifesto' },
        { text: 'Governance', link: '/philosophy/governance' },
      ],
    },
    {
      text: 'Technical',
      items: [
        { text: 'Architecture', link: '/technical/architecture' },
        { text: 'EIP-712 Signatures', link: '/technical/eip712-signatures' },
        { text: 'Smart Contracts', link: '/technical/contracts' },
        { text: 'Cross-Chain', link: '/technical/cross-chain' },
      ],
    },
    {
      text: 'Contributing',
      items: [
        { text: 'Setup', link: '/contributing/setup' },
        { text: 'Testing', link: '/contributing/testing' },
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
