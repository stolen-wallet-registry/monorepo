import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stolen Wallet Registry - Cross-Chain Fraud Detection',
  description:
    'Register compromised wallets, report fraudulent transactions, and catalog malicious contracts. A global, cross-chain registry for Web3 fraud prevention.',
  keywords: [
    'stolen wallet',
    'crypto fraud',
    'blockchain security',
    'cross-chain registry',
    'Web3 security',
    'wallet recovery',
  ],
  openGraph: {
    title: 'Stolen Wallet Registry',
    description: 'A global registry for stolen wallets and fraudulent transactions.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Space Grotesk + JetBrains Mono */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
