/**
 * Persian and English spell checking — the dictionary half.
 *
 * The decision logic (which words to look at) lives in `./words`, free of any
 * dictionary import so it can be tested for nothing. This module is only the
 * loader and the lookup.
 *
 * ## Two things worth knowing before enabling this
 *
 * **The webview cannot do it for you.** WebView2 spell-checks a textarea using
 * the language packs Windows has installed, and Persian very often is not one
 * of them — a Persian writer on an English Windows gets no checking at all.
 * That gap is the reason this exists.
 *
 * **The cost, measured rather than estimated.** Building the Persian checker
 * takes about **172 MB of heap and 2.3 seconds**. B mark otherwise runs in
 * roughly 100–150 MB, so turning this on roughly triples the footprint while
 * it is enabled. That is inherent to a Hunspell dictionary with Persian's
 * affix complexity, not something a different library avoids.
 *
 * So it is **off by default**, loaded lazily, and the settings panel states
 * the cost rather than letting the user find it in Task Manager.
 *
 * The `dictionary-*` npm packages cannot be imported: their entry point calls
 * `fs.readFile` from `node:fs` at module scope, which fails outright in a
 * webview, and their `exports` map does not expose the raw files. The
 * `.aff`/`.dic` are therefore vendored in `assets/dictionaries/` — see the
 * README there — and imported as URLs so Vite emits them as ordinary assets.
 */

import { candidateWords, type Candidate, type SpellOptions } from './words';

import faAff from '../../assets/dictionaries/fa.aff?url';
import faDic from '../../assets/dictionaries/fa.dic?url';
import enAff from '../../assets/dictionaries/en.aff?url';
import enDic from '../../assets/dictionaries/en.dic?url';

export interface Misspelling {
  word: string;
  /** Offset into the source text. */
  start: number;
  end: number;
  language: 'fa' | 'en';
}

type Checker = { correct: (word: string) => boolean; suggest: (word: string) => string[] };

const checkers = new Map<'fa' | 'en', Promise<Checker | null>>();

const DICTIONARY_URLS: Record<'fa' | 'en', { aff: string; dic: string }> = {
  fa: { aff: faAff, dic: faDic },
  en: { aff: enAff, dic: enDic },
};

async function loadChecker(lang: 'fa' | 'en'): Promise<Checker | null> {
  const existing = checkers.get(lang);
  if (existing) return existing;

  const promise = (async (): Promise<Checker | null> => {
    try {
      const urls = DICTIONARY_URLS[lang];
      const [{ default: nspell }, aff, dic] = await Promise.all([
        import('nspell'),
        fetch(urls.aff).then((r) => r.text()),
        fetch(urls.dic).then((r) => r.text()),
      ]);
      return nspell(aff, dic) as unknown as Checker;
    } catch (error) {
      console.warn(`[b-mark] ${lang} dictionary failed to load:`, error);
      return null;
    }
  })();

  checkers.set(lang, promise);
  return promise;
}

export async function checkSpelling(
  text: string,
  options: SpellOptions = {},
): Promise<Misspelling[]> {
  const candidates: Candidate[] = candidateWords(text, options);
  if (candidates.length === 0) return [];

  // Load only the dictionaries the text actually needs.
  const needed = new Set(candidates.map((c) => c.lang));
  const loaded = new Map<'fa' | 'en', Checker | null>();
  for (const lang of needed) loaded.set(lang, await loadChecker(lang));

  const found: Misspelling[] = [];
  for (const c of candidates) {
    const checker = loaded.get(c.lang);
    if (!checker) continue;
    if (checker.correct(c.word)) continue;
    found.push({ word: c.word, start: c.start, end: c.start + c.word.length, language: c.lang });
  }
  return found;
}

export async function suggest(word: string, language: 'fa' | 'en'): Promise<string[]> {
  const checker = await loadChecker(language);
  if (!checker) return [];
  try {
    return checker.suggest(word).slice(0, 6);
  } catch {
    return [];
  }
}

/** Drop the loaded dictionaries — used when the feature is switched off. */
export function releaseDictionaries(): void {
  checkers.clear();
}

export { candidateWords, looksWorthChecking } from './words';
export type { Candidate, SpellOptions } from './words';
