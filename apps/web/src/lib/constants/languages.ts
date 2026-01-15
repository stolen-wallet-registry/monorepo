/**
 * Shared language constants for soulbound tokens.
 *
 * These are used for client-side display and preview.
 * Actual on-chain translations come from the TranslationRegistry contract.
 */

/** Map of ISO 639-1 codes to display names */
export const LANGUAGE_NAMES: Record<string, string> = {
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

/** Map of ISO 639-1 codes to preview translations */
export const LANGUAGE_TRANSLATIONS: Record<string, string> = {
  en: 'This wallet has been marked as stolen.',
  es: 'Esta billetera ha sido marcada como robada.',
  zh: '此钱包已被标记为被盗。',
  fr: 'Ce portefeuille a été signalé comme volé.',
  de: 'Diese Wallet wurde als gestohlen markiert.',
  ja: 'このウォレットは盗難として報告されています。',
  ko: '이 지갑은 도난으로 신고되었습니다.',
  pt: 'Esta carteira foi marcada como roubada.',
  ru: 'Этот кошелек отмечен как украденный.',
  ar: 'تم وضع علامة على هذه المحفظة بأنها مسروقة.',
};

/**
 * Get display name for a language code.
 * Falls back to uppercase code if not found.
 */
export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/**
 * Get preview translation for a language code.
 * Falls back to English if not found.
 */
export function getLanguageTranslation(code: string): string {
  return LANGUAGE_TRANSLATIONS[code] ?? LANGUAGE_TRANSLATIONS.en;
}
