import { Link } from 'wouter';
import { Github, ExternalLink } from 'lucide-react';

/**
 * Documentation URL for footer link.
 */
const DOCS_URL = import.meta.env.VITE_DOCS_URL ?? 'http://localhost:5174';

/**
 * GitHub repository URL.
 */
const GITHUB_URL = 'https://github.com/stolenwalletregistry';

/**
 * Application footer with links and copyright.
 */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Register
            </Link>
            <Link href="/search" className="hover:text-foreground transition-colors">
              Search
            </Link>
            <Link href="/soulbound" className="hover:text-foreground transition-colors">
              Support
            </Link>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              Docs
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">{currentYear} Stolen Wallet Registry</p>
        </div>
      </div>
    </footer>
  );
}
