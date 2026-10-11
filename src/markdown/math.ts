/**
 * Math rendering with KaTeX.
 *
 * KaTeX is 3.9 MB unpacked, and most Markdown files contain no math at all, so
 * it is loaded lazily: the parser records where the formulas are, and the
 * library is fetched only when a document actually has some. On a document
 * without math, nothing is downloaded and nothing is parsed.
 *
 * Until the library resolves, each formula is shown as its own source in a
 * neutral box rather than blank — a reader should never lose content waiting
 * for a chunk to load.
 *
 * Direction: a formula is mathematical notation, which is left-to-right in
 * every language including Persian. Every rendered formula is isolated.
 */

import type { MarkdownIt, Token } from 'markdown-it';

type KatexApi = Awaited<typeof import('katex')>['default'];

let katexPromise: Promise<KatexApi | null> | null = null;

/** Load KaTeX and its stylesheet exactly once, on first use. */
export async function loadKatex(): Promise<KatexApi | null> {
  if (!katexPromise) {
    katexPromise = (async () => {
      try {
        const [mod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
        return mod.default;
      } catch (error) {
        console.warn('[b-mark] KaTeX failed to load; formulas stay as source:', error);
        return null;
      }
    })();
  }
  return katexPromise;
}

/**
 * Cheap pre-check so a document with no math never triggers the import.
 *
 * It must be *at least* as strict as the inline rule below, or the app fetches
 * a 261 KB chunk for a document with no formula in it — which is what the old
 * `/(?:^|[^\\$])\$\$?[^$]/` did: any lone `$` counted, so a Persian price list
 * ("price: $100"), a shell snippet ("use $HOME") or "a lone $ sign" all pulled
 * in KaTeX. On a metered connection that is a real cost for nothing.
 *
 * So the same two disambiguation rules Pandoc uses, and that `math_inline`
 * enforces, are applied here too:
 *
 *   1. the opening delimiter is not followed by whitespace,
 *   2. the closing delimiter is not preceded by whitespace and not followed by
 *      a digit (so "$5 to $10" is currency, not a formula containing "5 to ").
 *
 * An escaped `\$` is a literal dollar and never opens a formula.
 */
export function hasMath(source: string): boolean {
  // A block formula: $$ … $$ anywhere.
  if (/\$\$[\s\S]*?\$\$/.test(source)) return true;

  // An inline formula, with both disambiguation rules applied.
  const inline = /(?<!\\)\$(?!\s|\$)[^$\n]*?(?<!\s)\$(?!\d)/g;
  if (inline.test(source)) return true;

  return false;
}

export function renderMathInline(latex: string): string {
  return `<span class="math math--inline" dir="ltr" data-latex="${escapeAttr(latex)}">${escapeHtml(
    latex,
  )}</span>`;
}

export function renderMathBlock(latex: string): string {
  return `<div class="math math--block" dir="ltr" data-latex="${escapeAttr(latex)}">${escapeHtml(
    latex,
  )}</div>`;
}

/**
 * Replace every placeholder in `root` with typeset output.
 * Safe to call repeatedly; already-typeset nodes are skipped.
 */
export async function typesetMath(root: HTMLElement): Promise<void> {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>('.math[data-latex]:not([data-typeset])'),
  );
  if (nodes.length === 0) return;

  const katex = await loadKatex();
  if (!katex) return;

  for (const node of nodes) {
    const latex = node.getAttribute('data-latex') ?? '';
    const display = node.classList.contains('math--block');
    try {
      // `throwOnError: false` makes KaTeX render the offending source in red
      // instead of throwing, which is the right behaviour for a viewer: the
      // reader sees which formula is broken rather than losing the document.
      node.innerHTML = katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html',
        // No \includegraphics, no \href to arbitrary schemes.
        trust: false,
        maxSize: 50,
        maxExpand: 1000,
      });
      node.setAttribute('data-typeset', 'ok');
    } catch {
      node.setAttribute('data-typeset', 'failed');
      node.classList.add('math--error');
    }
  }
}

/**
 * markdown-it rules for `$...$` and `$$...$$`.
 *
 * Written by hand rather than pulled in as another dependency, because the
 * grammar is small and the escaping rules matter: a lone `$` in prose, and
 * `\$` as a literal dollar, must both survive untouched. Persian price lists
 * are full of currency symbols.
 */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '$') return false;
    // `$$` at inline level is a block delimiter, not inline math.
    if (state.src[start + 1] === '$') return false;
    // Escaped dollar.
    if (start > 0 && state.src[start - 1] === '\\') return false;

    let pos = start + 1;
    // No content, or opening delimiter followed by whitespace: not math.
    if (pos >= state.posMax || /\s/.test(state.src[pos] ?? '')) return false;

    while (pos < state.posMax) {
      if (state.src[pos] === '$' && state.src[pos - 1] !== '\\') break;
      pos++;
    }
    if (pos >= state.posMax) return false;

    const content = state.src.slice(start + 1, pos);
    if (content.trim().length === 0) return false;

    // Pandoc's two disambiguation rules, which exist because prose is full of
    // currency. Without them "from $5 to $10 dollars" parses as a formula
    // containing "5 to ".
    //
    //   1. The closing delimiter must not be preceded by whitespace.
    //   2. The closing delimiter must not be followed by a digit.
    if (/\s/.test(state.src[pos - 1] ?? '')) return false;
    if (/[0-9]/.test(state.src[pos + 1] ?? '')) return false;

    if (!silent) {
      const token = state.push('math_inline', 'span', 0);
      token.content = content;
      token.markup = '$';
    }
    state.pos = pos + 1;
    return true;
  });

  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine]! + state.tShift[startLine]!;
    const max = state.eMarks[startLine]!;
    if (start + 2 > max) return false;
    if (state.src.slice(start, start + 2) !== '$$') return false;

    let line = startLine;
    let found = false;
    const firstLineRest = state.src.slice(start + 2, max);

    // Single-line form: $$ ... $$
    if (firstLineRest.trim().endsWith('$$')) {
      found = true;
    } else {
      while (++line < endLine) {
        const from = state.bMarks[line]! + state.tShift[line]!;
        const to = state.eMarks[line]!;
        if (state.src.slice(from, to).trim() === '$$') {
          found = true;
          break;
        }
      }
    }
    if (!found) return false;
    if (silent) return true;

    const content =
      line === startLine
        ? firstLineRest.trim().replace(/\$\$$/, '')
        : state.getLines(startLine + 1, line, state.tShift[startLine]!, false);

    const token = state.push('math_block', 'div', 0);
    token.block = true;
    token.content = content;
    token.markup = '$$';
    token.map = [startLine, line + 1];

    state.line = line + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens: Token[], idx: number) =>
    renderMathInline(tokens[idx]!.content);
  md.renderer.rules.math_block = (tokens: Token[], idx: number) =>
    renderMathBlock(tokens[idx]!.content);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
