/**
 * B mark — internationalisation.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **No UI string is ever hard-coded in a component.** Everything comes
 *     from src/i18n/*.json, which is what makes `tests/i18n.spec.ts` able to
 *     prove the two catalogues have identical shapes.
 *
 *  2. **The interface language never dictates the document's direction.**
 *     Switching to Persian flips the chrome to RTL; the Markdown you are
 *     reading keeps whatever direction its own content implies. That
 *     separation is the whole point of the direction engine, and it would be
 *     trivially easy to break here by setting `dir` on <html> and letting it
 *     cascade — so the content root always carries its own explicit `dir`.
 */

import en from './en.json';
import fa from './fa.json';

export type Language = 'en' | 'fa';

export const LANGUAGES: Language[] = ['en', 'fa'];

type Catalogue = typeof en;

const CATALOGUES: Record<Language, Catalogue> = {
  en,
  fa: fa as unknown as Catalogue,
};

/** Dot-path into the catalogue, e.g. `toolbar.open`. */
export type MessageKey = string;

let current: Language = 'en';

export function setLanguage(lang: Language): void {
  current = LANGUAGES.includes(lang) ? lang : 'en';
}

export function getLanguage(): Language {
  return current;
}

/** Direction of the *interface* for the active language. */
export function uiDirection(lang: Language = current): 'rtl' | 'ltr' {
  return CATALOGUES[lang].meta.dir === 'rtl' ? 'rtl' : 'ltr';
}

export function languageName(lang: Language): string {
  return CATALOGUES[lang].meta.nativeName;
}

function lookup(catalogue: Catalogue, key: string): unknown {
  let node: unknown = catalogue;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * Translate `key`, interpolating `{placeholders}` from `vars`.
 *
 * A missing key falls back to English and then to the key itself, so a typo
 * shows up as visible text rather than an empty element or a thrown error.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let value = lookup(CATALOGUES[current], key);
  if (typeof value !== 'string') value = lookup(CATALOGUES.en, key);
  if (typeof value !== 'string') return key;

  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Localise digits for display.
 *
 * Persian readers expect ۱۲۳ in prose, but a file path, a percentage in a
 * control, or anything the user might copy should stay ASCII. So this is
 * opt-in per call site rather than a blanket transform.
 */
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function localiseDigits(input: string | number, lang: Language = current): string {
  const text = String(input);
  if (lang !== 'fa') return text;
  return text.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

/** Every key in a catalogue, flattened — used by the completeness test. */
export function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

export { en as enCatalogue, fa as faCatalogue };
