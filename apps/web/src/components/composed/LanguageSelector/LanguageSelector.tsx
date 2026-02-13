/**
 * Language selector component for soulbound token preview.
 *
 * Allows users to select their preferred language for the on-chain SVG artwork preview.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  getLanguageName,
  LANGUAGE_NAMES,
} from '@swr/ui';

/** Supported language codes */
const LANGUAGES = Object.keys(LANGUAGE_NAMES);

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
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {getLanguageName(lang)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
