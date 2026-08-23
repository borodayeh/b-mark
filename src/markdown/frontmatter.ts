/**
 * YAML front matter.
 *
 * Nearly every Markdown file produced by Hugo, Jekyll, Obsidian, Zettlr or any
 * static-site generator opens with a `---` fenced metadata block. Without a
 * plugin, markdown-it reads the opening `---` as a horizontal rule and the
 * first key as a heading, so the document begins with a stray line and a
 * mangled title. That is not a missing feature; it is a wrong rendering of the
 * most common real-world file shape.
 *
 * We parse a deliberately small subset of YAML — scalars, inline lists, block
 * lists — and present it as a metadata card above the document. Pulling in a
 * full YAML parser would add more surface area than the job needs, and front
 * matter in practice is flat.
 */

import { detectDirection } from '../direction/unicode';

export interface FrontMatterField {
  key: string;
  values: string[];
  dir: 'rtl' | 'ltr';
}

export interface FrontMatter {
  fields: FrontMatterField[];
  /** The raw block, kept so nothing is silently lost. */
  raw: string;
}

export interface SplitSource {
  frontMatter: FrontMatter | null;
  /** Everything after the closing delimiter — the actual document. */
  body: string;
}

/**
 * Separate a leading front-matter block from the document body.
 *
 * Done here rather than with `markdown-it-front-matter` because that plugin
 * treats an *unterminated* opening `---` as running to the end of the file.
 * A document that legitimately begins with a horizontal rule —
 *
 *     ---
 *
 *     Some text.
 *
 * — was therefore swallowed whole and rendered as a blank page. Losing the
 * user's document to a formatting guess is not an acceptable failure mode, so
 * the rule here is strict: a block counts as front matter only when the
 * closing delimiter actually exists. Anything else is left for the Markdown
 * parser to treat as ordinary content.
 */
export function splitFrontMatter(source: string): SplitSource {
  // Tolerate a BOM and CRLF, but the opening fence must be the very first line.
  const text = source.replace(/^\uFEFF/, '');
  const match = /^---[ \t]*\r?\n/.exec(text);
  if (!match) return { frontMatter: null, body: source };

  const afterOpen = match[0].length;
  // YAML permits `...` as a terminator as well as `---`.
  const close = /\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text.slice(afterOpen));
  if (!close) return { frontMatter: null, body: source };

  const raw = text.slice(afterOpen, afterOpen + close.index);
  const body = text.slice(afterOpen + close.index + close[0].length);

  // An empty block is not metadata; treat it as two horizontal rules.
  if (raw.trim().length === 0) return { frontMatter: null, body: source };

  return { frontMatter: parseFrontMatter(raw), body };
}

/** Keys worth showing prominently, in the order people expect them. */
const PRIMARY_KEYS = ['title', 'subtitle', 'description', 'author', 'authors', 'date', 'tags'];

function stripQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function splitInlineList(value: string): string[] {
  const v = value.trim();
  if (!v.startsWith('[') || !v.endsWith(']')) return [stripQuotes(v)];
  return v
    .slice(1, -1)
    .split(',')
    .map(stripQuotes)
    .filter((s) => s.length > 0);
}

export function parseFrontMatter(raw: string): FrontMatter {
  const fields: FrontMatterField[] = [];
  const lines = raw.split(/\r?\n/);

  let current: FrontMatterField | null = null;

  for (const line of lines) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;

    // A block-list item belonging to the previous key.
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && current) {
      const value = stripQuotes(listItem[1] ?? '');
      if (value) current.values.push(value);
      continue;
    }

    const pair = /^([A-Za-z0-9_.\- ]+):\s*(.*)$/.exec(line);
    if (!pair) continue;

    const key = (pair[1] ?? '').trim();
    const rest = (pair[2] ?? '').trim();

    current = { key, values: rest ? splitInlineList(rest) : [], dir: 'ltr' };
    fields.push(current);
  }

  // Direction is resolved per field, so a Persian title right-aligns while an
  // ISO date beside it does not.
  for (const f of fields) {
    f.dir = detectDirection(f.values.join(' ') || f.key);
  }

  return { fields, raw };
}

export function frontMatterToHtml(fm: FrontMatter): string {
  if (fm.fields.length === 0) return '';

  const byKey = new Map(fm.fields.map((f) => [f.key.toLowerCase(), f]));
  const title = byKey.get('title');
  const subtitle = byKey.get('subtitle') ?? byKey.get('description');

  const rest = fm.fields.filter((f) => {
    const k = f.key.toLowerCase();
    return k !== 'title' && k !== 'subtitle' && k !== 'description';
  });

  const chip = (f: FrontMatterField) =>
    `<div class="frontmatter__row" dir="${f.dir}">
       <span class="frontmatter__key">${escapeHtml(f.key)}</span>
       <span class="frontmatter__values">${f.values
         .map((v) => `<span class="frontmatter__value">${escapeHtml(v)}</span>`)
         .join('')}</span>
     </div>`;

  // Known keys first, in a predictable order; anything else after.
  const ordered = [
    ...PRIMARY_KEYS.map((k) => rest.find((f) => f.key.toLowerCase() === k)).filter(
      (f): f is FrontMatterField => f !== undefined,
    ),
    ...rest.filter((f) => !PRIMARY_KEYS.includes(f.key.toLowerCase())),
  ];

  return `<aside class="frontmatter" aria-label="document metadata">
    ${
      title && title.values.length > 0
        ? `<h1 class="frontmatter__title" dir="${title.dir}">${escapeHtml(title.values.join(' '))}</h1>`
        : ''
    }
    ${
      subtitle && subtitle.values.length > 0
        ? `<p class="frontmatter__subtitle" dir="${subtitle.dir}">${escapeHtml(
            subtitle.values.join(' '),
          )}</p>`
        : ''
    }
    ${ordered.length > 0 ? `<div class="frontmatter__grid">${ordered.map(chip).join('')}</div>` : ''}
  </aside>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
