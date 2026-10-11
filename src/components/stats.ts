/**
 * Reading statistics for the status bar.
 *
 * Word counting is language-specific and most implementations quietly assume
 * English. Splitting on whitespace undercounts nothing in Persian — it is
 * space-separated too — but ZWNJ must not be treated as a separator, or
 * "می‌خواهم" counts as two words when it is one. Conversely CJK has no spaces
 * at all, so each ideograph counts as a word.
 *
 * Reading speed also differs by script. The figures below are the commonly
 * cited averages for silent reading of prose; they are an estimate and the UI
 * presents them as one.
 */

export interface DocumentStats {
  words: number;
  characters: number;
  /** Characters excluding whitespace. */
  charactersNoSpaces: number;
  /** Estimated silent reading time, in minutes, minimum 1. */
  readingMinutes: number;
  headings: number;
  codeBlocks: number;
  tables: number;
  images: number;
  links: number;
}

const WORDS_PER_MINUTE_LATIN = 230;
const WORDS_PER_MINUTE_ARABIC = 180;

/** Ranges that have no word separators, so each character is a unit. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const ARABIC_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/g;

export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.replace(CJK, ' ');

  const words = rest
    // ZWNJ joins one word; it is not a separator.
    .replace(/\u200c/g, '')
    .split(/[\s\u00a0]+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

  return words + cjk;
}

export function analyse(content: HTMLElement): DocumentStats {
  // Code is not prose: counting it inflates reading time badly on a technical
  // document. Clone, drop the code, then measure.
  const clone = content.cloneNode(true) as HTMLElement;
  for (const pre of Array.from(clone.querySelectorAll('pre, .code-copy'))) pre.remove();
  const prose = clone.textContent ?? '';

  const words = countWords(prose);
  const arabicChars = prose.match(ARABIC_SCRIPT)?.length ?? 0;
  const mostlyArabic = arabicChars > prose.replace(/\s/g, '').length * 0.3;
  const wpm = mostlyArabic ? WORDS_PER_MINUTE_ARABIC : WORDS_PER_MINUTE_LATIN;

  return {
    words,
    // Words and characters are measured on the same text, so the two numbers
    // in the status bar describe the same document. Counting `characters` over
    // the whole rendered tree while `words` excluded code produced pairs like
    // "3 words · 1007 characters" — true of the file, meaningless to a reader.
    characters: prose.length,
    charactersNoSpaces: prose.replace(/\s/g, '').length,
    readingMinutes: Math.max(1, Math.round(words / wpm)),
    headings: content.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
    codeBlocks: content.querySelectorAll('pre').length,
    tables: content.querySelectorAll('table').length,
    images: content.querySelectorAll('img').length,
    links: content.querySelectorAll('a').length,
  };
}
