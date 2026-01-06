import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { CrossChainSection } from '@/components/landing/CrossChainSection';
import { RegistriesSection } from '@/components/landing/RegistriesSection';
import { OperatorsSection } from '@/components/landing/OperatorsSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { MethodsSection } from '@/components/landing/MethodsSection';
import { FooterCTA, Footer } from '@/components/landing/FooterCTA';

/**
 * Landing page - Marketing/SEO entry point for Stolen Wallet Registry.
 *
 * This is a static page (SSG) with no on-chain functionality.
 * Users click "Launch App" to navigate to the Vite registration app.
 *
 * Sections:
 * 1. Header - Sticky nav with theme toggle and Launch App
 * 2. Hero - "Stolen {Wallet|Transaction} Registry" with rotating text, Globe
 * 3. Cross-Chain - Data flow visualization showing multi-chain architecture
 * 4. Registries - Three registry cards (Wallets, Transactions, Contracts)
 * 5. Operators - Trusted Operator Program (Coming Soon)
 * 6. How It Works - Two-phase registration explanation
 * 7. Methods - Three registration method options
 * 8. FooterCTA - Call to action with Launch App button
 * 9. Footer - Simple copyright/info
 */
export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <Header />
      <HeroSection />
      <CrossChainSection />
      <RegistriesSection />
      <OperatorsSection />
      <HowItWorksSection />
      <MethodsSection />
      <FooterCTA />
      <Footer />
    </main>
  );
}
