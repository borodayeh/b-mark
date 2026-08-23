/**
 * B mark — Unicode script/direction primitives.
 *
 * Why not just `dir="auto"`?
 * -------------------------
 * The HTML `dir="auto"` heuristic uses the *first strong character* of an
 * element. That is exactly what MarkText does at document level (see
 * docs/references/marktext-printService.ts) and it fails badly on real
 * Persian technical writing, e.g.:
 *
 *     `npm install` را در ترمینال اجرا کنید.
 *
 * First strong char is Latin `n`, so `dir="auto"` renders that whole Persian
 * sentence LTR with the period on the wrong side. B mark instead *weighs* the
 * strong characters of each block and ignores characters that live inside
 * code spans, URLs and file paths — those are lexically LTR but say nothing
 * about the language of the prose around them.
 */

export type Direction = 'rtl' | 'ltr';
export type DirectionMode = 'auto' | 'rtl' | 'ltr';

/**
 * Strong RTL ranges (Unicode 15). Covers Hebrew, Arabic, Persian, Urdu,
 * Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic Extended-A/B, plus the
 * Arabic Presentation Forms blocks that show up in copy-pasted text.
 */
const RTL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic (includes Persian ی ک گ چ پ ژ)
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x08ff], // NKo, Samaritan, Mandaic, Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew Presentation Forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
  [0x10800, 0x10fff], // Cypriot .. Old Hungarian etc.
  [0x1e800, 0x1efff], // Mende Kikakui, Adlam, Arabic Math
];

/**
 * Carve-outs inside the RTL blocks that are NOT strong characters.
 *
 * This matters a great deal in practice: Persian digits (۰-۹, U+06F0..U+06F9)
 * and Arabic-Indic digits (٠-٩, U+0660..U+0669) sit right in the middle of the
 * Arabic block but their Bidi class is EN/AN — they are *neutral*. Counting
 * them as strong RTL would make "۱۲۳۴" or a numeric table cell claim RTL and
 * drag a neutral block to the wrong side. Same story for the combining marks
 * (harakat / Hebrew points), whose Bidi class is NSM.
 */
const RTL_BLOCK_NEUTRALS: ReadonlyArray<readonly [number, number]> = [
  // --- Arabic block ---
  [0x0600, 0x0605], // Arabic number signs (AN)
  [0x060c, 0x060c], // ARABIC COMMA (CS)
  [0x0660, 0x0669], // ٠-٩ Arabic-Indic digits (AN)
  [0x066b, 0x066c], // decimal / thousands separator (AN)
  [0x064b, 0x065f], // harakat (NSM)
  [0x0670, 0x0670], // superscript alef (NSM)
  [0x06d6, 0x06dd], // Quranic marks + ARABIC END OF AYAH (NSM/AN)
  [0x06df, 0x06e4], // (NSM)
  [0x06e7, 0x06e8], // (NSM)
  [0x06ea, 0x06ed], // (NSM)
  [0x06f0, 0x06f9], // ۰-۹ Extended Arabic-Indic digits (EN)
  // --- Hebrew block ---
  [0x0591, 0x05bd], // cantillation + points (NSM)
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x05c7, 0x05c7],
  // --- Syriac / Thaana / NKo combining marks ---
  [0x0711, 0x0711],
  [0x0730, 0x074a],
  [0x07a6, 0x07b0],
  [0x07eb, 0x07f3],
  [0x07fd, 0x07fd],
  [0x0816, 0x0819],
  [0x081b, 0x0823],
  [0x0825, 0x0827],
  [0x0829, 0x082d],
  [0x0859, 0x085b],
  [0x08d3, 0x08e1],
  [0x08e3, 0x08ff],
];

/** Strong LTR ranges — deliberately narrow: Latin, Greek, Cyrillic. */
const LTR_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0041, 0x005a], // A-Z
  [0x0061, 0x007a], // a-z
  [0x00c0, 0x024f], // Latin-1 Supplement + Extended A/B
  [0x0370, 0x03ff], // Greek
  [0x0400, 0x04ff], // Cyrillic
  [0x1e00, 0x1eff], // Latin Extended Additional
];

/**
 * Explicit Unicode bidi controls. If an author put one of these in the text
 * they meant it, and it outranks any statistical guess.
 */
const RLM = 0x200f; // RIGHT-TO-LEFT MARK
const LRM = 0x200e; // LEFT-TO-RIGHT MARK
const RLE = 0x202b;
const LRE = 0x202a;
const RLI = 0x2067;
const LRI = 0x2066;

function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  // Linear scan. The lists are short and this runs once per character of a
  // block's prose, which is negligible next to the Markdown parse itself.
  // No early-exit on order — the tables are grouped by script for readability,
  // not sorted numerically.
  for (const r of ranges) {
    if (cp >= r[0] && cp <= r[1]) return true;
  }
  return false;
}

export function isStrongRtl(cp: number): boolean {
  if (inRanges(cp, RTL_BLOCK_NEUTRALS)) return false;
  return inRanges(cp, RTL_RANGES);
}

export function isStrongLtr(cp: number): boolean {
  return inRanges(cp, LTR_RANGES);
}

/**
 * Text that should not influence the direction of surrounding prose:
 *  - `inline code`  and fenced code
 *  - bare URLs and markdown link targets
 *  - Windows / POSIX file paths
 *  - HTML tags
 *  - @mentions and #hashtags of ASCII
 *
 * Removing these before counting is the single biggest accuracy win over
 * `dir="auto"`.
 */
const NEUTRALISERS: ReadonlyArray<RegExp> = [
  /```[\s\S]*?```/g, // fenced code
  /~~~[\s\S]*?~~~/g,
  /`[^`\n]*`/g, // inline code
  /<[^>\n]{1,200}>/g, // html tags / autolinks
  /\b[a-z][a-z0-9+.-]{1,15}:\/\/\S+/gi, // scheme://…
  /\bwww\.[^\s)]+/gi,
  /\b[A-Za-z]:\\[^\s)]+/g, // C:\path\to\file
  /(?:^|\s)\.{0,2}\/[^\s)]+/g, // ./relative/path
  /\]\([^)\s]+/g, // markdown link target
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // e-mail
];

export function stripDirectionNoise(text: string): string {
  let out = text;
  for (const re of NEUTRALISERS) out = out.replace(re, ' ');
  return out;
}

export interface DirectionScore {
  rtl: number;
  ltr: number;
  /** rtl / (rtl + ltr), or 0 when there is no strong character at all. */
  ratio: number;
  /** True when the text has no strong character in either script. */
  neutral: boolean;
  /** Set when an explicit Unicode bidi control decided the outcome. */
  forcedBy?: 'RLM' | 'LRM' | 'RLE' | 'LRE' | 'RLI' | 'LRI';
}

/**
 * A block counts as RTL when at least this share of its strong characters is
 * RTL. Deliberately low: a Persian sentence quoting an English product name
 * is still a Persian sentence, and RTL is far more sensitive to being wrong
 * than LTR is. Calibrated against tests/fixtures — see tests/direction.spec.ts.
 */
export const RTL_THRESHOLD = 0.3;

export function scoreDirection(rawText: string): DirectionScore {
  const text = stripDirectionNoise(rawText);

  let rtl = 0;
  let ltr = 0;
  let forcedBy: DirectionScore['forcedBy'];

  for (const ch of text) {
    const cp = ch.codePointAt(0)!;

    if (!forcedBy) {
      if (cp === RLM) forcedBy = 'RLM';
      else if (cp === LRM) forcedBy = 'LRM';
      else if (cp === RLE) forcedBy = 'RLE';
      else if (cp === LRE) forcedBy = 'LRE';
      else if (cp === RLI) forcedBy = 'RLI';
      else if (cp === LRI) forcedBy = 'LRI';
    }

    if (isStrongRtl(cp)) rtl++;
    else if (isStrongLtr(cp)) ltr++;
    // Everything else — digits (both ASCII and ۰-۹), ZWNJ (U+200C), spaces,
    // shared punctuation, emoji — is neutral and never counted.
  }

  const total = rtl + ltr;
  const score: DirectionScore = {
    rtl,
    ltr,
    ratio: total === 0 ? 0 : rtl / total,
    neutral: total === 0,
  };
  if (forcedBy) score.forcedBy = forcedBy;
  return score;
}

/**
 * Resolve the direction of a single piece of text.
 *
 * @param text     the raw text of the block
 * @param inherit  direction to use when the text is fully neutral
 *                 (digits only, an image, a horizontal rule, …)
 */
export function detectDirection(text: string, inherit: Direction = 'ltr'): Direction {
  const s = scoreDirection(text);

  if (s.forcedBy === 'RLM' || s.forcedBy === 'RLE' || s.forcedBy === 'RLI') return 'rtl';
  if (s.forcedBy === 'LRM' || s.forcedBy === 'LRE' || s.forcedBy === 'LRI') return 'ltr';

  if (s.neutral) return inherit;
  return s.ratio >= RTL_THRESHOLD ? 'rtl' : 'ltr';
}
