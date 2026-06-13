import th from "./th";
import en from "./en";

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
};

export const translations = { th, en } as const;

export type TranslationDict = typeof th;

// Dot-notation key type (up to 3 levels deep)
type DotKeys<T, P extends string = ""> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? DotKeys<T[K], P extends "" ? `${string & K}` : `${P}.${string & K}`>
    : P extends ""
    ? `${string & K}`
    : `${P}.${string & K}`;
}[keyof T];

export type TKey = DotKeys<TranslationDict>;

// Resolve a dot-notation key into the translation value
export function resolve(dict: TranslationDict, key: string): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = dict;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return key;
    current = current[part];
  }
  return typeof current === "string" ? current : key;
}
