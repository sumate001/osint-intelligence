"use client";

import { useLocaleStore } from "@/lib/stores/locale";
import { translations, resolve } from "@/lib/i18n";

/**
 * useT() — returns a translation function t(key)
 *
 * Usage:
 *   const t = useT();
 *   t("nav.today")          // "Today's Intel" | "Today's Intel"
 *   t("common.save")        // "บันทึก" | "Save"
 *   t("verdict.PRIORITY")   // "เร่งด่วน" | "Priority"
 */
export function useT() {
  const { locale } = useLocaleStore();
  const dict = translations[locale];
  return (key: string): string => resolve(dict, key);
}
