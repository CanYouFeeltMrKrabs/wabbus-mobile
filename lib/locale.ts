/**
 * Locale utilities — delegates to i18next for the resolved language.
 *
 * getLocale() returns the active language code used for API Accept-Language
 * headers and locale-aware formatting. i18next (initialized in i18n/index.ts
 * via expo-localization device detection) is the single source of truth.
 */
import i18n from "@/i18n";

const SUPPORTED_LOCALES = ["en", "es", "id"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function getLocale(): SupportedLocale {
  const lang = i18n.language;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
    return lang as SupportedLocale;
  }
  return "en";
}
