import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "./en.json";
import es from "./es.json";
import id from "./id.json";
import zh from "./zh.json";

const SUPPORTED_LANGUAGES = ["en", "es", "id", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function detectDeviceLanguage(): SupportedLanguage {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const tag = locales[0].languageCode?.toLowerCase();
      if (tag && (SUPPORTED_LANGUAGES as readonly string[]).includes(tag)) {
        return tag as SupportedLanguage;
      }
    }
  } catch {
    // expo-localization unavailable (e.g. unit tests)
  }
  return "en";
}

const resources = {
  en: { translation: en },
  es: { translation: es },
  id: { translation: id },
  zh: { translation: zh },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  compatibilityJSON: "v4",
});

export default i18n;
