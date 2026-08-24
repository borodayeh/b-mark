/**
 * B mark — per-block direction application.
 *
 * Runs over the rendered DOM (not the Markdown source) so that it sees exactly
 * the text the user will see, with entities already decoded and inline markup
 * already stripped into text nodes.
 */

import { detectDirection, scoreDirection, type Direction, type DirectionMode } from './unicode';

/**
 * Block-level elements that get their own direction. A block inherits from its
 * nearest resolved ancestor when its own text is neutral, which is what makes
 * "1. ۱۲۳" inside a Persian list stay right-aligned.
 */
const DIRECTIONAL_BLOCKS =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, dt, dd, figcaption, summary, caption';

/**
 * Elements that are *always* LTR regardless of surrounding prose. Code, links
 * targets and keyboard keys are lexical, not linguistic.
 */
const ALWAYS_LTR = 'pre, code, kbd, samp, var, tt';

export interface ApplyDirectionOptions {
  /** 'auto' = per-block detection. 'rtl'/'ltr' = force the whole document. */
  mode?: DirectionMode;
  /** Direction used for fully neutral blocks with no resolved ancestor. */
  fallback?: Direction;
  /**
   * When true, code blocks follow the surrounding prose instead of being
   * forced LTR. Off by default; exposed in Settings.
   */
  codeFollowsProse?: boolean;
}

/**
 * Text of an element, minus anything inside always-LTR descendants.
 *
 * @param includeNestedBlocks  when false (the default) nested directional
 *   blocks are skipped so each block votes only with its own prose. Container
 *   blocks like `<blockquote>` hold *nothing but* nested blocks, so they need
 *   a second pass with this on — otherwise they always read as neutral and
 *   silently fall back to LTR.
 */
function proseTextOf(el: Element, includeNestedBlocks = false): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* Text */) {
      out += node.nodeValue ?? '';
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    if (child.matches(ALWAYS_LTR)) continue;
    if (!includeNestedBlocks && child.matches(DIRECTIONAL_BLOCKS)) continue;
    out += proseTextOf(child, includeNestedBlocks);
    out += ' ';
  }
  return out;
}

function resolvedDirOf(el: Element | null): Direction | null {
  const d = el?.getAttribute('data-bmark-dir');
  return d === 'rtl' || d === 'ltr' ? d : null;
}

/**
 * Where a neutral block gets its direction from, in priority order:
 *   1. the previous already-resolved sibling block  (a numeric row in a
 *      Persian list belongs with that list)
 *   2. the next sibling block, once resolved
 *   3. the nearest resolved ancestor
 *   4. the document fallback
 *
 * Note that (2) is why neutral blocks are deferred to a second pass.
 */
function inheritFor(el: Element, root: Element, fallback: Direction): Direction {
  let prev = el.previousElementSibling;
  while (prev) {
    const d = resolvedDirOf(prev);
    if (d) return d;
    prev = prev.previousElementSibling;
  }

  let next = el.nextElementSibling;
  while (next) {
    const d = resolvedDirOf(next);
    if (d) return d;
    next = next.nextElementSibling;
  }

  let cur: Element | null = el.parentElement;
  while (cur && cur !== root.parentElement) {
    const d = resolvedDirOf(cur);
    if (d) return d;
    cur = cur.parentElement;
  }

  return fallback;
}

/**
 * Apply direction to every block inside `root`.
 * Returns the number of blocks that were marked RTL (useful for tests/status bar).
 */
export function applyDirection(root: Element, opts: ApplyDirectionOptions = {}): number {
  const mode = opts.mode ?? 'auto';
  const fallback = opts.fallback ?? 'ltr';
  const codeFollowsProse = opts.codeFollowsProse ?? false;

  // Forced mode: one attribute on the root, nothing per-block.
  if (mode === 'rtl' || mode === 'ltr') {
    root.setAttribute('dir', mode);
    for (const el of Array.from(root.querySelectorAll('[data-bmark-dir]'))) {
      el.removeAttribute('dir');
      el.removeAttribute('data-bmark-dir');
    }
    if (!codeFollowsProse) forceCodeLtr(root);
    return mode === 'rtl' ? 1 : 0;
  }

  root.setAttribute('dir', fallback);

  const blocks = Array.from(root.querySelectorAll(DIRECTIONAL_BLOCKS));
  const deferred: Element[] = [];
  let rtlCount = 0;

  // --- Pass 1: every block that can decide on its own evidence. ----------
  for (const block of blocks) {
    // Own prose first; container blocks fall back to their descendants' prose.
    let text = proseTextOf(block, false);
    if (scoreDirection(text).neutral) {
      text = proseTextOf(block, true);
    }

    if (scoreDirection(text).neutral) {
      deferred.push(block);
      continue;
    }

    const dir = detectDirection(text, fallback);
    block.setAttribute('dir', dir);
    block.setAttribute('data-bmark-dir', dir);
    if (dir === 'rtl') rtlCount++;
  }

  // --- Pass 2: neutral blocks inherit from their resolved neighbours. -----
  for (const block of deferred) {
    const dir = inheritFor(block, root, fallback);
    block.setAttribute('dir', dir);
    block.setAttribute('data-bmark-dir', dir);
    if (dir === 'rtl') rtlCount++;
  }

  // --- Pass 3: containers whose child order depends on direction. --------
  // A table has to pick one direction for its column order; the majority of
  // its cells decides, otherwise columns of a Persian table read backwards.
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const cells = Array.from(table.querySelectorAll('th, td'));
    const rtl = cells.filter((c) => resolvedDirOf(c) === 'rtl').length;
    const tableDir: Direction = cells.length > 0 && rtl * 2 >= cells.length ? 'rtl' : 'ltr';
    table.setAttribute('dir', tableDir);
    table.setAttribute('data-bmark-dir', tableDir);
    const wrap = table.parentElement;
    if (wrap?.classList.contains('table-wrap')) wrap.setAttribute('dir', tableDir);
  }

  // Lists: bullets/numbers must sit on the side the majority of items use.
  for (const list of Array.from(root.querySelectorAll('ul, ol'))) {
    const items = Array.from(list.children).filter((c) => c.tagName === 'LI');
    const rtl = items.filter((c) => resolvedDirOf(c) === 'rtl').length;
    const listDir: Direction = items.length > 0 && rtl * 2 >= items.length ? 'rtl' : 'ltr';
    list.setAttribute('dir', listDir);
    list.setAttribute('data-bmark-dir', listDir);
  }

  if (!codeFollowsProse) forceCodeLtr(root);
  return rtlCount;
}

function forceCodeLtr(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(ALWAYS_LTR))) {
    el.setAttribute('dir', 'ltr');
  }
  // Anchors whose visible text *is* the URL are lexical too.
  for (const a of Array.from(root.querySelectorAll('a'))) {
    const text = (a.textContent ?? '').trim();
    if (/^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)/i.test(text)) {
      a.setAttribute('dir', 'ltr');
    }
  }
}
