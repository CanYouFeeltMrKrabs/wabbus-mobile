import { Platform, NativeModules } from "react-native";

const SUPPORTED_LOCALES = ["en", "es", "id"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function getDeviceLanguage(): string {
  try {
    if (Platform.OS === "ios") {
      const settings =
        NativeModules.SettingsManager?.settings ??
        NativeModules.I18nManager;
      const langs: string[] | undefined =
        settings?.AppleLanguages ?? settings?.localeIdentifier;
      if (Array.isArray(langs) && langs.length > 0) {
        return langs[0].split("-")[0].split("_")[0].toLowerCase();
      }
      if (typeof langs === "string") {
        return langs.split("_")[0].toLowerCase();
      }
    }
    if (Platform.OS === "android") {
      const lang = NativeModules.I18nManager?.localeIdentifier;
      if (typeof lang === "string") {
        return lang.split("_")[0].toLowerCase();
      }
    }
  } catch {
    // fall through
  }
  return "en";
}

let _cached: SupportedLocale | null = null;

export function getLocale(): SupportedLocale {
  if (_cached) return _cached;
  const lang = getDeviceLanguage();
  _cached = (SUPPORTED_LOCALES as readonly string[]).includes(lang)
    ? (lang as SupportedLocale)
    : "en";
  return _cached;
}
