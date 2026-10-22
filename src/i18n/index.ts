import type { LanguageSetting } from "../types";
import { ru } from "./ru";

/**
 * Minimal UI localisation. English strings are the keys; `ru` maps them to
 * Russian, and anything missing falls back to English. The App sets the
 * language on every render and remounts the UI when it changes, so plain
 * `t()` calls (no hook) are enough everywhere, including the store.
 */

export type Language = "en" | "ru";

let current: Language = "en";

export function resolveLanguage(setting: LanguageSetting | undefined): Language {
  if (setting === "en" || setting === "ru") return setting;
  const system = typeof navigator !== "undefined" ? navigator.language : "en";
  return system.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function setLanguage(language: Language) {
  current = language;
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

export function getLanguage(): Language {
  return current;
}

/** Translates `key`; `{name}` placeholders are filled from `vars`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let text = current === "ru" ? (ru[key] ?? key) : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/**
 * Count-aware text: `forms.en` is [one, other], `forms.ru` is
 * [one, few, many] (1 файл, 2 файла, 5 файлов). `{n}` is replaced by n.
 */
export function plural(
  n: number,
  en: [string, string],
  ruForms: [string, string, string],
): string {
  let form: string;
  if (current === "ru") {
    const mod10 = n % 10;
    const mod100 = n % 100;
    form =
      mod10 === 1 && mod100 !== 11
        ? ruForms[0]
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? ruForms[1]
          : ruForms[2];
  } else {
    form = n === 1 ? en[0] : en[1];
  }
  return form.split("{n}").join(String(n));
}

/** Locale for dates and numbers. */
export function locale(): string {
  return current === "ru" ? "ru-RU" : "en-GB";
}
