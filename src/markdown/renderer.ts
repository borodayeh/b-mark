/**
 * B mark — Markdown rendering pipeline.
 *
 *   source ──markdown-it──> HTML ──DOMPurify──> safe HTML ──applyDirection──> DOM
 *
 * Security posture (see docs/00-research.md §12):
 *   * `html: false` by default — raw HTML in the document is escaped, not run.
 *   * When the user opts in to raw HTML, DOMPurify strips scripts, event
 *     handlers, iframes, object/embed and javascript: URLs.
 *   * `linkify` is on, but every link is rewritten to be inert; opening one
 *     goes through an explicit user gesture handled by the shell.
 */

import MarkdownItCtor from 'markdown-it';
import type { MarkdownIt, MarkdownItOptions } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import deflist from 'markdown-it-deflist';
import mark from 'markdown-it-mark';
import ins from 'markdown-it-ins';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import { highlightCode, isLanguageSupported } from './highlight';
import { splitFrontMatter, frontMatterToHtml, type FrontMatter } from './frontmatter';
import { mathPlugin, hasMath } from './math';

export interface RenderOptions {
  /** Allow raw HTML blocks from the document (always sanitised afterwards). */
  allowRawHtml?: boolean;
  /** Render $...$ and $$...$$ with KaTeX. */
  math?: boolean;
  /** Turn ```mermaid fences into diagrams. */
  diagrams?: boolean;
  /** Show the YAML front-matter block as a metadata card. */
  showFrontMatter?: boolean;
  /** Run syntax highlighting on fenced code blocks. */
  syntaxHighlight?: boolean;
  /** Turn bare URLs into links. */
  linkify?: boolean;
  /** Typographic replacements (-- → –, quotes). Off for Persian by default. */
  typographer?: boolean;
}

export const DEFAULT_RENDER_OPTIONS: Required<RenderOptions> = {
  allowRawHtml: false,
  math: true,
  diagrams: true,
  showFrontMatter: true,
  syntaxHighlight: true,
  linkify: true,
  typographer: false,
};

function buildRenderer(opts: Required<RenderOptions>): MarkdownIt {
  const config: MarkdownItOptions = {
    html: opts.allowRawHtml,
    xhtmlOut: false,
    breaks: false,
    langPrefix: 'language-',
    linkify: opts.linkify,
    typographer: opts.typographer,
    highlight: opts.syntaxHighlight
      ? (code: string, lang: string) => highlightCode(code, lang)
      : undefined,
  };

  const md = new MarkdownItCtor(config);

  // GFM strikethrough and tables ship with markdown-it's default preset.
  md.enable(['strikethrough', 'table']);

  md.use(taskLists, { enabled: true, label: true, labelAfter: false });
  md.use(footnote);
  md.use(deflist);
  md.use(mark);   // ==highlight==
  md.use(ins);    // ++inserted++
  md.use(sub);    // H~2~O
  md.use(sup);    // x^2^

  if (opts.math) {
    md.use(mathPlugin);
  }
  md.use(anchor, {
    // Persian headings must produce usable, stable ids.
    slugify: slugifyHeading,
    tabIndex: false,
  });

  applyRendererOverrides(md, opts);
  return md;
}

/**
 * Slug that survives Persian text. `encodeURIComponent` keeps the characters
 * addressable while GitHub-style slugs would throw them away entirely.
 */
export function slugifyHeading(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[\s\u200c]+/g, '-') // spaces and ZWNJ → hyphen
    .replace(/["'`<>[\]{}()!?.,;:@#$%^&*+=|\\/~]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.length > 0 ? encodeURIComponent(cleaned) : 'section';
}

function applyRendererOverrides(md: MarkdownIt, opts: Required<RenderOptions>): void {
  // --- Links: never navigate the webview itself. -------------------------
  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, o, _env, self) => self.renderToken(tokens, idx, o));

  md.renderer.rules.link_open = (tokens, idx, o, env, self) => {
    const token = tokens[idx]!;
    const href = String(token.attrGet('href') ?? '');

    if (isExternalHref(href)) {
      // The shell intercepts clicks on [data-external] and asks the OS to open
      // it. Keeping the real href on a data-attribute means a stray navigation
      // cannot happen even if our click handler fails to bind.
      token.attrSet('data-external', href);
      token.attrSet('href', '#');
      token.attrSet('rel', 'noopener noreferrer nofollow');
    } else if (href.startsWith('#')) {
      token.attrSet('data-anchor', href.slice(1));
    } else if (href.length > 0) {
      // Relative path to another document on disk.
      token.attrSet('data-relative', href);
      token.attrSet('href', '#');
    }
    return defaultLinkOpen(tokens, idx, o, env, self);
  };

  // --- Fences: expose the language so the UI can label the block. --------
  const defaultFence =
    md.renderer.rules.fence ??
    ((tokens, idx, o, _env, self) => self.renderToken(tokens, idx, o));

  md.renderer.rules.fence = (tokens, idx, o, env, self) => {
    const token = tokens[idx]!;
    const info = token.info.trim().split(/\s+/)[0] ?? '';
    const html = defaultFence(tokens, idx, o, env, self);
    const label = info && isLanguageSupported(info) ? info : info || 'text';
    // Wrap so the CSS can pin a language chip and an isolated x-scroller.
    return `<div class="code-block" data-lang="${escapeAttr(label)}" dir="ltr">${html}</div>`;
  };

  // --- Images: mark them so the settings toggle can block remote ones. ---
  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, o, _env, self) => self.renderToken(tokens, idx, o));

  md.renderer.rules.image = (tokens, idx, o, env, self) => {
    const token = tokens[idx]!;
    const src = String(token.attrGet('src') ?? '');
    token.attrSet('loading', 'lazy');
    token.attrSet('decoding', 'async');
    if (isExternalHref(src)) {
      token.attrSet('data-remote', '1');
      token.attrSet('data-src', src);
      token.attrSet('src', '');
    } else {
      token.attrSet('data-relative-src', src);
    }
    return defaultImage(tokens, idx, o, env, self);
  };

  // --- Tables: wrap for horizontal containment (see §7 overflow). --------
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
  md.renderer.rules.table_close = () => '</table></div>';

  void opts;
}

export function isExternalHref(href: string): boolean {
  return /^(?:https?:|mailto:|tel:|ftp:)/i.test(href) || href.startsWith('//');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Cached renderer — rebuilding markdown-it per keystroke is wasteful. */
let cached: { key: string; md: MarkdownIt } | null = null;

export function getRenderer(options: RenderOptions = {}): MarkdownIt {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const key = JSON.stringify(opts);
  if (cached?.key !== key) {
    cached = { key, md: buildRenderer(opts) };
  }
  return cached.md;
}

export interface RenderResult {
  html: string;
  frontMatter: FrontMatter | null;
  /** True when the source contains at least one formula. */
  math: boolean;
}

/** Render Markdown source to (still unsanitised) HTML, with metadata. */
export function renderMarkdownDetailed(
  source: string,
  options: RenderOptions = {},
): RenderResult {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };

  // Split first: the body is what the parser sees, so an unterminated `---`
  // can never consume the document.
  const { frontMatter, body: markdown } = splitFrontMatter(source);

  const body = getRenderer(options).render(markdown);
  const html = opts.showFrontMatter && frontMatter ? frontMatterToHtml(frontMatter) + body : body;

  return { html, frontMatter, math: opts.math && hasMath(markdown) };
}

/** Render Markdown source to (still unsanitised) HTML. */
export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  return renderMarkdownDetailed(source, options).html;
}
