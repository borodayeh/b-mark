/**
 * Spell checking in the rendered document.
 *
 * Why here and not in the editor: a `<textarea>` cannot draw squiggles, and
 * Windows ships no Persian dictionary, so WebView2's own `spellcheck`
 * attribute is useless for the one language this app exists for. The rendered
 * preview, on the other hand, is real DOM, and the CSS Custom Highlight API
 * can underline arbitrary ranges in it without touching the markup — no
 * wrapper spans, so no interference with the direction engine, find, or copy.
 *
 * The dictionaries are big (the Persian one costs roughly 172 MB of heap and
 * about two seconds to build), so nothing is loaded until the setting is on
 * and a document is actually on screen.
 */

import { checkSpelling } from '../persian/spellcheck';

/** Elements whose text is lexical, not linguistic. */
const SKIP_SELECTOR = 'code, pre, kbd, samp, var, .math, .katex, .diagram, .frontmatter__key';

const HIGHLIGHT_NAME = 'bmark-spell';

const supportsHighlightApi =
  typeof CSS !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (CSS as any).highlights !== 'undefined' &&
  typeof (window as { Highlight?: unknown }).Highlight === 'function';

export interface SpellRun {
  /** How many misspellings were painted. */
  count: number;
  /** False when the browser cannot paint highlights; the count is still real. */
  painted: boolean;
}

let generation = 0;

/** Remove any painted misspellings. Safe to call when nothing is painted. */
export function clearSpellHighlights(): void {
  generation++;
  if (!supportsHighlightApi) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((CSS as any).highlights as Map<string, unknown>).delete(HIGHLIGHT_NAME);
}

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || node.nodeValue.trim().length < 3) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/**
 * Check `root` and paint every misspelling.
 *
 * Each text node is checked on its own. A word split across two nodes by
 * inline markup (`**hell**o`) is therefore checked as two fragments and, being
 * shorter than three characters or not a word, usually just skipped — an
 * occasional miss, never a false alarm on correct prose.
 *
 * Returns the number of misspellings found. A stale call — one whose document
 * has already been replaced — resolves with a count of zero and paints
 * nothing.
 */
export async function highlightMisspellings(root: HTMLElement): Promise<SpellRun> {
  const mine = ++generation;
  const nodes = textNodes(root);
  if (nodes.length === 0) {
    clearSpellHighlights();
    return { count: 0, painted: supportsHighlightApi };
  }

  const ranges: Range[] = [];
  let count = 0;

  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const found = await checkSpelling(text);
    // The document may have been closed or re-rendered while a dictionary was
    // loading; painting into a detached tree would leak highlights.
    if (mine !== generation) return { count: 0, painted: false };
    if (found.length === 0) continue;

    count += found.length;
    if (!supportsHighlightApi) continue;

    for (const m of found) {
      const r = document.createRange();
      try {
        r.setStart(node, m.start);
        r.setEnd(node, m.end);
        ranges.push(r);
      } catch {
        /* the node changed underneath us */
      }
    }
  }

  if (mine !== generation) return { count: 0, painted: false };
  if (!supportsHighlightApi) return { count, painted: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).Highlight;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlights = (CSS as any).highlights as Map<string, unknown>;
  highlights.set(HIGHLIGHT_NAME, new Ctor(...ranges));

  return { count, painted: true };
}

export const __testing = { textNodes, supportsHighlightApi };
