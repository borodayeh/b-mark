/**
 * Which words a spell check should look at.
 *
 * Deliberately separate from the dictionary loader. This is where the quality
 * of a spell checker inside a Markdown editor is actually decided — a checker
 * that flags every identifier, path segment and URL is one people switch off
 * within a minute — and keeping it free of the 3 MB of dictionary assets means
 * it can be tested exhaustively for nothing.
 */

import { detectDirection } from '../direction/unicode';

export interface Candidate {
  word: string;
  start: number;
  lang: 'fa' | 'en';
}

export interface SpellOptions {
  /** Cap the work on a very large document; the rest is left unchecked. */
  maxWords?: number;
}

/**
 * Regions of the source that must not be checked. Same principle as the text
 * tools: a checker that shouts at your code is a checker you switch off.
 */
const SKIP: ReadonlyArray<RegExp> = [
  /```[\s\S]*?```/g,
  /~~~[\s\S]*?~~~/g,
  /`[^`\n]*`/g,
  /^\s{4,}\S.*$/gm,
  /<[^>\n]{1,300}>/g,
  /\b[a-z][a-z0-9+.-]{1,15}:\/\/\S+/gi,
  /\b[A-Za-z]:\\[^\s)]+/g,
  /\]\([^)\s]*\)/g,
  /[\p{L}\p{N}._+-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]+/gu,
  /\$\$[\s\S]*?\$\$/gu,
  /(?<!\\)\$[^$\n]+\$/g,
  // YAML front matter: keys are identifiers, not prose.
  // The `g` flag is load-bearing — see the loop below.
  /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*$/gm,
];

function skipRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (const re of SKIP) {
    // `exec` in a loop only advances when the regex is global; without the
    // flag it returns the same match from position 0 forever. One pattern in
    // the list above was missing it, and the result was an infinite loop that
    // filled `ranges` until the process ran out of memory. Asserting the flag
    // here means a future addition cannot reintroduce that.
    if (!re.global) {
      const once = re.exec(text);
      if (once) ranges.push([once.index, once.index + once[0].length]);
      continue;
    }

    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
      // A zero-length match would not advance `lastIndex` either.
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  return ranges.sort((a, b) => a[0] - b[0]);
}

function inAnyRange(pos: number, ranges: Array<[number, number]>): boolean {
  // Ranges are sorted; a linear scan is fine for a document-sized input.
  for (const [from, to] of ranges) {
    if (pos < from) return false;
    if (pos < to) return true;
  }
  return false;
}

/**
 * A "word" for spelling purposes: letters, plus the ZWNJ and the apostrophe,
 * which sit *inside* Persian and English words respectively. Splitting on the
 * ZWNJ would turn every «می‌خواهم» into two unknown fragments.
 */
const WORD = /[\p{L}\u200c'’]+/gu;

/** Words that are correct but absent from a general dictionary. */
const ALLOWLIST = new Set([
  'markdown',
  'b',
  'mark',
  'bmark',
  'github',
  'json',
  'yaml',
  'html',
  'css',
  'url',
  'pdf',
  'docx',
  'rtl',
  'ltr',
  'مارک‌داون',
  'فارسی',
]);

export function candidateWords(text: string, options: SpellOptions = {}): Candidate[] {
  const maxWords = options.maxWords ?? 20_000;
  const ranges = skipRanges(text);
  const candidates: Candidate[] = [];

  WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = WORD.exec(text)) !== null && seen < maxWords) {
    const word = m[0];
    const start = m.index;
    seen++;

    if (word.length < 3) continue;
    if (inAnyRange(start, ranges)) continue;
    // A word containing digits is an identifier or a version, not prose.
    if (/[\p{N}]/u.test(word)) continue;
    if (ALLOWLIST.has(word.toLowerCase())) continue;

    const lang = detectDirection(word, 'ltr') === 'rtl' ? 'fa' : 'en';
    // A capitalised word mid-sentence is usually a name; too noisy to flag.
    if (lang === 'en' && /^[A-Z]/.test(word)) continue;

    candidates.push({ word, start, lang });
  }

  return candidates;
}

/** Cheap pre-check so a document with no prose never loads a dictionary. */
export function looksWorthChecking(text: string): boolean {
  return /[\p{L}]{3,}/u.test(text);
}
