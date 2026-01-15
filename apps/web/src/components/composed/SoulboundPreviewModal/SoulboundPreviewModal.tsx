/**
 * Soulbound token preview modal.
 *
 * Shows a dialog with language selector and live SVG preview.
 * Allows users to preview how their soulbound token will look
 * in different languages before minting.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  ScrollArea,
} from '@swr/ui';
import { SoulboundSvgPreview } from '@/components/composed/SoulboundSvgPreview';
import { LanguageSelector } from '@/components/composed/LanguageSelector';
import { Eye, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SoulboundPreviewModalProps {
  /** Type of soulbound token to preview */
  type: 'wallet' | 'support';
  /** Initial language code */
  initialLanguage?: string;
  /** Callback when language changes (for external state sync) */
  onLanguageChange?: (language: string) => void;
  /** Additional class names for trigger button */
  className?: string;
  /** Custom trigger content (default: "Preview" button) */
  trigger?: React.ReactNode;
}

/**
 * Modal dialog for previewing soulbound tokens.
 *
 * Features:
 * - Language selector to see translations
 * - Live SVG preview with animation
 * - Information about token characteristics
 *
 * @example
 * ```tsx
 * <SoulboundPreviewModal
 *   type="wallet"
 *   initialLanguage="en"
 *   onLanguageChange={(lang) => setLanguage(lang)}
 * />
 * ```
 */
export function SoulboundPreviewModal({
  type,
  initialLanguage = 'en',
  onLanguageChange,
  className,
  trigger,
}: SoulboundPreviewModalProps) {
  const [language, setLanguage] = useState(initialLanguage);

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    onLanguageChange?.(newLanguage);
  };

  const title = type === 'wallet' ? 'Wallet Soulbound Token' : 'Support Soulbound Token';
  const description =
    type === 'wallet'
      ? 'Preview how your commemorative token will look. Select a language to see the translation.'
      : 'Preview your supporter token. Choose a language for the international message.';

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className={cn('gap-2', className)}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Language selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Language</label>
            <LanguageSelector
              value={language}
              onChange={handleLanguageChange}
              className="w-full max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              The token will display text in your selected language
            </p>
          </div>

          {/* Preview container */}
          <ScrollArea className="max-h-[500px]">
            <div className="flex justify-center py-4">
              <SoulboundSvgPreview type={type} language={language} />
            </div>
          </ScrollArea>

          {/* Token info */}
          <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">About this token</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Non-transferable (ERC-5192 Soulbound)</li>
                <li>Permanently bound to your wallet</li>
                <li>On-chain SVG artwork</li>
                <li>Internationalized text in {type === 'wallet' ? '20+' : '20+'} languages</li>
                {type === 'wallet' ? (
                  <li>One token per registered wallet</li>
                ) : (
                  <li>Unlimited - mint as many as you like</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
