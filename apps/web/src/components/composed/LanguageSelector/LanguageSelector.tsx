/**
 * Language selector component for soulbound token minting.
 *
 * Allows users to select their preferred language for the on-chain SVG artwork.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@swr/ui';
import { useSupportedLanguages } from '@/hooks/soulbound';

/** Map of ISO 639-1 codes to display names */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  zh: 'Chinese',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
};

export interface LanguageSelectorProps {
  /** Currently selected language code */
  value: string;
  /** Callback when language changes */
  onChange: (language: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Dropdown selector for choosing soulbound token language.
 *
 * Fetches available languages from the TranslationRegistry contract
 * and displays them with localized names.
 *
 * @example
 * ```tsx
 * const [language, setLanguage] = useState('en');
 * return <LanguageSelector value={language} onChange={setLanguage} />;
 * ```
 */
export function LanguageSelector({
  value,
  onChange,
  disabled = false,
  className,
}: LanguageSelectorProps) {
  const { languages, isLoading } = useSupportedLanguages();

  // Use fetched languages if available, otherwise fallback to English
  const availableLanguages = languages.length > 0 ? languages : ['en'];

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? 'Loading...' : 'Select language'} />
      </SelectTrigger>
      <SelectContent>
        {availableLanguages.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_NAMES[lang] ?? lang.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
