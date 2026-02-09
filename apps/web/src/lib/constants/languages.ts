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

/** Map of ISO 639-1 codes to wallet soulbound preview translations (max ~25 chars) */
export const WALLET_TRANSLATIONS: Record<string, string> = {
  en: 'Signed as stolen',
  es: 'Firmado como robado',
  zh: '已签名为被盗',
  fr: 'Signé comme volé',
  de: 'Als gestohlen signiert',
  ja: '盗難として署名済み',
  ko: '도난으로 서명됨',
  pt: 'Assinado como roubado',
  ru: 'Подписан как украден',
  ar: 'موقع كمسروق',
};

/** Map of ISO 639-1 codes to support soulbound preview translations (max ~25 chars) */
export const SUPPORT_TRANSLATIONS: Record<string, string> = {
  en: 'Registry Supporter',
  es: 'Apoyador del Registro',
  zh: '注册支持者',
  fr: 'Supporteur du Registre',
  de: 'Registry Unterstützer',
  ja: 'レジストリサポーター',
  ko: '레지스트리 지지자',
  pt: 'Apoiador do Registro',
  ru: 'Поддержка реестра',
  ar: 'داعم السجل',
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
 *
 * @param code - ISO 639-1 language code
 * @param type - Token type ('wallet' or 'support')
 */
export function getLanguageTranslation(
  code: string,
  type: 'wallet' | 'support' = 'wallet'
): string {
  const translations = type === 'wallet' ? WALLET_TRANSLATIONS : SUPPORT_TRANSLATIONS;
  return translations[code] ?? translations['en'] ?? 'Signed as stolen';
}
