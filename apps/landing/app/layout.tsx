import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

import { ThemeProvider } from '@/providers/ThemeProvider';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
});

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
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stolenwalletregistry.com',
    siteName: 'Stolen Wallet Registry',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
