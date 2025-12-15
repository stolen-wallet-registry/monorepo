import { Button } from '@swr/ui';
import Link from 'next/link';

/**
 * Landing page - placeholder structure.
 *
 * This is the marketing/SEO landing page. No Web3 functionality here.
 * Users click "Launch App" to go to the Vite app with wallet connection.
 *
 * Run `/execute-prp PRPs/07-landing-page-registry-navigation.md` to build out
 * the full landing page with all sections (Globe, Beams, Features, etc.).
 */

/**
 * App URL for "Launch App" links.
 * Configured via NEXT_PUBLIC_APP_URL environment variable.
 * Falls back to localhost:5173 for development.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="text-xl font-bold">SWR</div>
        <Button asChild>
          <Link href={APP_URL}>Launch App</Link>
        </Button>
      </header>

      {/* Hero Section - Placeholder */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Stolen Wallet Registry</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          A global, cross-chain registry for stolen wallets and fraudulent transactions. Register
          compromised wallets, report fraud, and help protect the Web3 ecosystem.
        </p>
        <div className="mt-10 flex gap-4">
          <Button asChild size="lg">
            <Link href={APP_URL}>Launch App</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="#how-it-works">Learn More</Link>
          </Button>
        </div>
      </section>

      {/* Placeholder sections - will be built out via PRP-07 */}
      <section id="how-it-works" className="border-t border-border px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Additional sections (Globe, Cross-Chain Viz, How It Works, etc.) coming soon.
          <br />
          Run the PRP-07 execute command to build them out.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        <p>Stolen Wallet Registry - A public good for Web3 security</p>
      </footer>
    </main>
  );
}
