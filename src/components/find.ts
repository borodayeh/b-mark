/**
 * Find in document.
 *
 * Uses the CSS Custom Highlight API where available — it paints matches
 * without touching the DOM, so it cannot disturb the direction attributes the
 * engine just resolved, and it costs nothing to clear. WebView2 on Windows 10
 * and 11 is evergreen Chromium and has supported it since 105, which is the
 * build target; the DOM fallback exists for older embedded runtimes and for
 * jsdom under test.
 *
 * Persian matching needs two normalisations that a naive `indexOf` misses:
 * Arabic ي/ك versus Persian ی/ک, and ZWNJ. Someone searching for "می خواهم"
 * should find "می‌خواهم".
 */

export interface FindMatch {
  node: Text;
  start: number;
  end: number;
}

const supportsHighlightApi =
  typeof CSS !== 'undefined' &&
  'highlights' in CSS &&
  typeof Range !== 'undefined';

/**
 * Fold the differences that Persian typists produce but do not mean.
 *
 * The output must be the same length as the input, character for character,
 * or the offsets computed against it will not map back onto the real text.
 */
export function foldForSearch(input: string): string {
  let out = '';
  for (const ch of input) {
    switch (ch) {
      case '\u064A': // ARABIC YEH  ي
      case '\u0649': // ALEF MAKSURA ى
        out += '\u06CC'; // FARSI YEH ی
        break;
      case '\u0643': // ARABIC KAF ك
        out += '\u06A9'; // KEHEH ک
        break;
      case '\u0629': // TEH MARBUTA ة
        out += '\u0647'; // HEH ه
        break;
      case '\u200C': // ZWNJ — a typist may or may not have used one
      case '\u200F':
      case '\u200E':
        out += ' ';
        break;
      // Arabic-Indic and Persian digits fold to ASCII so "۱۲۳" finds "123".
      default: {
        const cp = ch.codePointAt(0)!;
        if (cp >= 0x0660 && cp <= 0x0669) out += String.fromCharCode(cp - 0x0660 + 48);
        else if (cp >= 0x06f0 && cp <= 0x06f9) out += String.fromCharCode(cp - 0x06f0 + 48);
        else {
          // A few characters lowercase to a LONGER string ('İ' U+0130 becomes
          // 'i' + combining dot). Emitting that would shift every offset
          // after it, so where the fold cannot stay one-for-one the original
          // character is kept instead — matching such a word then simply
          // stays case-sensitive, which is wrong less often than a misaligned
          // highlight.
          const low = ch.toLowerCase();
          out += low.length === ch.length ? low : ch;
        }
      }
    }
  }
  return out;
}

/** Every text node under `root`, skipping code blocks' syntax spans is not
 *  necessary — a reader searching for a token expects to find it in code too. */
function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip whitespace-only nodes and anything inside a hidden element.
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (parent && parent.closest('[hidden], .find-bar')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

export function findMatches(root: HTMLElement, query: string): FindMatch[] {
  const needle = foldForSearch(query).trim();
  if (needle.length === 0) return [];

  const matches: FindMatch[] = [];
  for (const node of textNodes(root)) {
    const hay = foldForSearch(node.nodeValue ?? '');
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      matches.push({ node, start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }
  return matches;
}

export class FindController {
  private root: HTMLElement;
  private scroller: HTMLElement;
  private matches: FindMatch[] = [];
  private index = -1;

  constructor(root: HTMLElement, scroller: HTMLElement) {
    this.root = root;
    this.scroller = scroller;
  }

  search(query: string): { total: number; current: number } {
    this.clear();
    this.matches = findMatches(this.root, query);
    this.index = this.matches.length > 0 ? 0 : -1;
    this.paint();
    this.reveal();
    return this.status();
  }

  next(): { total: number; current: number } {
    if (this.matches.length === 0) return this.status();
    this.index = (this.index + 1) % this.matches.length;
    this.paint();
    this.reveal();
    return this.status();
  }

  previous(): { total: number; current: number } {
    if (this.matches.length === 0) return this.status();
    this.index = (this.index - 1 + this.matches.length) % this.matches.length;
    this.paint();
    this.reveal();
    return this.status();
  }

  status(): { total: number; current: number } {
    return { total: this.matches.length, current: this.index + 1 };
  }

  private ranges(): { all: Range[]; active: Range | null } {
    const all: Range[] = [];
    let active: Range | null = null;
    this.matches.forEach((m, i) => {
      const r = document.createRange();
      try {
        r.setStart(m.node, m.start);
        r.setEnd(m.node, m.end);
      } catch {
        return; // the node changed underneath us; skip it
      }
      if (i === this.index) active = r;
      else all.push(r);
    });
    return { all, active };
  }

  private paint(): void {
    if (!supportsHighlightApi) return;
    const { all, active } = this.ranges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highlights = (CSS as any).highlights as Map<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).Highlight;
    if (!Ctor) return;
    highlights.set('bmark-find', new Ctor(...all));
    highlights.set('bmark-find-active', active ? new Ctor(active) : new Ctor());
  }

  private reveal(): void {
    const m = this.matches[this.index];
    if (!m) return;
    const el = m.node.parentElement;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const view = this.scroller.getBoundingClientRect();
    if (box.top < view.top + 40 || box.bottom > view.bottom - 40) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  clear(): void {
    this.matches = [];
    this.index = -1;
    if (!supportsHighlightApi) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highlights = (CSS as any).highlights as Map<string, unknown>;
    highlights.delete('bmark-find');
    highlights.delete('bmark-find-active');
  }
}
