/**
 * DevTools "soulbound" tab panel - SVG preview plus notes on testing on-chain
 * translations.
 *
 * Preview type is owned by DevTools so the selection survives switching tabs.
 */

import { SoulboundSvgPreview } from '@swr/ui';
import { cn } from '@/lib/utils';

interface SoulboundTabProps {
  previewType: 'wallet' | 'support';
  setPreviewType: (type: 'wallet' | 'support') => void;
}

export function SoulboundTab({ previewType, setPreviewType }: SoulboundTabProps) {
  return (
    <>
      {/* Token Type Toggle */}
      <div className="mb-3">
        <span
          id="devtools-preview-type"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Preview Type
        </span>
        <div role="group" aria-labelledby="devtools-preview-type" className="flex gap-2">
          <button
            type="button"
            onClick={() => setPreviewType('wallet')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              previewType === 'wallet'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Wallet
          </button>
          <button
            type="button"
            onClick={() => setPreviewType('support')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              previewType === 'support'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Support
          </button>
        </div>
      </div>

      {/* SVG Preview */}
      <div className="flex justify-center rounded-lg bg-muted/50 p-2">
        <SoulboundSvgPreview type={previewType} size={200} />
      </div>

      {/* Testing Translations - Instructions */}
      <div className="mt-3 border-t border-border pt-3">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Testing Minted SVG Translations
        </h4>
        <p className="text-xs text-muted-foreground mb-2">
          On-chain SVGs embed all translations via{' '}
          <code className="bg-muted px-1 rounded">&lt;switch&gt;</code> elements with{' '}
          <code className="bg-muted px-1 rounded">systemLanguage</code> attributes. The browser
          selects which translation to display based on its language settings.
        </p>
        <div className="mb-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Contract files:</p>
          <ul className="list-disc list-inside space-y-0.5 text-[10px]">
            <li>
              <code className="bg-muted px-1 rounded">
                contracts/src/soulbound/TranslationRegistry.sol
              </code>
            </li>
            <li>
              <code className="bg-muted px-1 rounded">
                contracts/src/soulbound/libraries/SVGRenderer.sol
              </code>
            </li>
          </ul>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">To test:</p>
          <p>
            <strong className="text-foreground">Chrome:</strong> Settings → Languages → drag to top
            → reload
          </p>
          <p>
            <strong className="text-foreground">Firefox:</strong> Settings → Language → move to top
            → reload
          </p>
          <p>
            <strong className="text-foreground">Safari:</strong> System Settings → Language & Region
            → reload
          </p>
        </div>
      </div>
    </>
  );
}
