/**
 * Export to a self-contained HTML file, and print.
 *
 * "Self-contained" is the whole point: one file you can email, that opens in
 * any browser, with no external CSS, no CDN font, and no network access — the
 * same guarantee the app itself makes. The Vazirmatn weights are inlined as
 * base64 data URIs, which is why the export is a few hundred kilobytes rather
 * than a few kilobytes. That is a deliberate trade: a document that renders
 * Persian correctly on a machine with no Persian font is worth more than a
 * small file that does not.
 *
 * The per-block `dir` attributes survive the export untouched, so a mixed
 * Persian/English document reads correctly in the recipient's browser even
 * though B mark is not installed there.
 */

import { markForExport } from './logo';
import { store } from '../settings/store';
import { FONT_STACKS } from '../settings/schema';
import { getHost } from '../platform';

import contentCss from '../styles/content.css?inline';
import vazirRegular from '../../assets/fonts/Vazirmatn-Regular.woff2?url';
import vazirMedium from '../../assets/fonts/Vazirmatn-Medium.woff2?url';
import vazirSemiBold from '../../assets/fonts/Vazirmatn-SemiBold.woff2?url';
import vazirBold from '../../assets/fonts/Vazirmatn-Bold.woff2?url';

const FONT_FILES: Array<[number, string]> = [
  [400, vazirRegular],
  [500, vazirMedium],
  [600, vazirSemiBold],
  [700, vazirBold],
];

async function toDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:font/woff2;base64,${btoa(binary)}`;
  } catch {
    // A missing font must not fail the export; the reader falls back to a
    // system face and the document is still readable.
    return null;
  }
}

async function inlineFonts(): Promise<string> {
  const faces = await Promise.all(
    FONT_FILES.map(async ([weight, url]) => {
      const data = await toDataUri(url);
      if (!data) return '';
      return `@font-face{font-family:'Vazirmatn';src:local('Vazirmatn'),url(${data}) format('woff2');font-weight:${weight};font-style:normal;font-display:swap}`;
    }),
  );
  return faces.join('\n');
}

/**
 * Theme values are frozen into the export rather than referenced, so the file
 * looks the same everywhere instead of inheriting the reader's preferences.
 * Dark-on-paper prints badly, so an export is always light.
 */
const EXPORT_TOKENS = `
:root{
  --bg:#ffffff; --bg-subtle:#f6f7f9; --bg-hover:#eceef1;
  --fg:#1b1f24; --fg-muted:#59636e; --fg-faint:#848d97;
  --border:#d8dde3; --border-subtle:#e8ebef;
  --code-bg:#f4f6f8; --code-fg:#1b1f24; --quote-border:#d0d7de;
  --accent:#557300; --accent-fill:#BEFB00; --accent-fill-ink:#101401;
  --radius-sm:6px; --radius-md:10px; --radius-lg:14px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px; --space-6:32px;
  --hl-keyword:#cf222e; --hl-string:#0a3069; --hl-comment:#6e7781;
  --hl-number:#0550ae; --hl-function:#8250df; --hl-title:#953800;
}`;

const PRINT_CSS = `
@media print{
  @page{margin:18mm 16mm}
  body{background:#fff}
  .export-header{display:none}
  .content{max-width:none;padding:0}
  .content h1,.content h2,.content h3{break-after:avoid-page}
  .content pre,.content .table-wrap,.content img,.content blockquote{break-inside:avoid}
  .content pre{white-space:pre-wrap;overflow:visible}
  .content .table-wrap{overflow:visible}
  .content a{color:inherit;border-bottom:0}
  /* A printed link is useless unless its target is visible. Keyed off the
     real href, because the app's data-external attribute is stripped from the
     export — and printing an in-document anchor's target would be noise. */
  .content a[href^="http"]::after{content:" (" attr(href) ")";font-size:.82em;color:#59636e;word-break:break-all}
}`;

export interface ExportOptions {
  title: string;
  /** The rendered, sanitised content element. */
  content: HTMLElement;
}

export async function buildStandaloneHtml(options: ExportOptions): Promise<string> {
  const s = store.current;
  const fonts = await inlineFonts();

  // Clone so the live document is never mutated by export-only cleanup.
  const clone = options.content.cloneNode(true) as HTMLElement;

  // Links are inert in the app (href="#", real target on data-external).
  // In a standalone file they should work again. This must run before the
  // data-* attributes are stripped below.
  for (const a of Array.from(clone.querySelectorAll('a[data-external]'))) {
    a.setAttribute('href', a.getAttribute('data-external') ?? '#');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  }
  for (const a of Array.from(clone.querySelectorAll('a[data-anchor]'))) {
    a.setAttribute('href', `#${a.getAttribute('data-anchor')}`);
  }
  // Blocked remote images stay blocked. markdown-it emits `src=""` rather than
  // omitting the attribute, so an `:not([src])` selector misses them entirely.
  for (const img of Array.from(clone.querySelectorAll<HTMLImageElement>('img[data-remote]'))) {
    if (!img.getAttribute('src')) {
      img.replaceWith(document.createTextNode(`[${img.getAttribute('alt') || 'image'}]`));
    }
  }

  // The copy buttons the viewer injects are chrome, not content.
  for (const btn of Array.from(clone.querySelectorAll('.code-copy'))) btn.remove();

  // Strip the app's own bookkeeping attributes.
  //
  // `data-src` is the important one: it holds the URL of a remote image the
  // user chose to block. Leaving it in an exported file would carry that URL
  // into a document they are about to email to someone — exactly the leak the
  // block was meant to prevent. The rest are simply noise in a shared file.
  const INTERNAL_ATTRS = [
    'data-src',
    'data-remote',
    'data-external',
    'data-anchor',
    'data-relative',
    'data-relative-src',
    'data-bmark-dir',
  ];
  for (const node of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
    for (const attr of INTERNAL_ATTRS) node.removeAttribute(attr);
  }
  clone.removeAttribute('data-bmark-dir');

  // The content root already carries the direction the engine resolved,
  // including the neutral fallback; freeze that into the exported file.
  const rootDir = clone.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr';

  return `<!doctype html>
<html lang="${s.language}" dir="${rootDir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="B mark">
<title>${escapeHtml(options.title)}</title>
<style>
${fonts}
${EXPORT_TOKENS}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;background:var(--bg)}
body{
  font-family:${FONT_STACKS.vazirmatn};
  color:var(--fg);
  -webkit-font-smoothing:antialiased;
}
.export-header{
  display:flex;align-items:center;gap:10px;
  max-width:${s.contentWidth}px;margin:0 auto;
  padding:20px 24px 0;color:var(--fg-faint);font-size:12px;
}
.export-header strong{color:var(--fg);font-weight:600;font-size:13px}
:root{
  --font-content:${FONT_STACKS[s.contentFont]};
  --font-code:${FONT_STACKS[s.codeFont]};
  --content-font-size:${s.fontSize}px;
  --content-line-height:${s.lineHeight};
  --content-font-weight:${s.fontWeight};
  --paragraph-spacing:${s.paragraphSpacing}em;
  --content-max-width:${s.contentWidth}px;
}
${contentCss}
${PRINT_CSS}
</style>
</head>
<body>
<header class="export-header">
  ${markForExport(18)}<strong>${escapeHtml(options.title)}</strong>
  <span>&middot; exported from B mark</span>
</header>
${clone.outerHTML}
</body>
</html>`;
}

/**
 * Write the standalone file wherever the host can put it.
 *
 * Resolves the file name written, or null if the user cancelled the save
 * dialog. It deliberately does not resolve a name on cancellation: the caller
 * shows a "saved" toast, and claiming success for a file nobody wrote is the
 * exact bug this replaced.
 */
export async function exportHtml(options: ExportOptions): Promise<string | null> {
  const html = await buildStandaloneHtml(options);
  const base = options.title.replace(/\.[^.]+$/, '') || 'document';

  return getHost().saveExport({
    name: `${base}.html`,
    bytes: new TextEncoder().encode(html),
    mime: 'text/html;charset=utf-8',
    filterName: 'HTML',
    extensions: ['html'],
  });
}

/**
 * Print, and therefore "Save as PDF" via the system dialog.
 *
 * Printing the live app would carry the toolbar, the outline and the editor
 * onto the page, so this prints a clean copy in a hidden iframe instead.
 */
export async function printDocument(options: ExportOptions): Promise<void> {
  const html = await buildStandaloneHtml(options);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error('print_frame_unavailable');
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    const go = () => {
      // Give the inlined fonts a moment, or the first page prints in a
      // fallback face.
      const ready = (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
      void Promise.resolve(ready).then(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        resolve();
      });
    };
    if (doc.readyState === 'complete') go();
    else frame.addEventListener('load', go, { once: true });
  });

  setTimeout(() => frame.remove(), 60_000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
