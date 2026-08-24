/**
 * DOCX export.
 *
 * The reason this exists: a Persian writer finishes a document in Markdown and
 * then has to hand it to a colleague, a supervisor or a journal — people who
 * work in Word. Until now the honest answer was "export HTML and hope". This
 * produces a real .docx.
 *
 * The part that matters, and that generic Markdown-to-Word converters get
 * wrong: **direction survives**. OOXML expresses it in two places that both
 * have to be set —
 *
 *   * `<w:bidi/>` in the paragraph properties makes the *paragraph* RTL, which
 *     is what puts the text on the right and the full stop in the right place;
 *   * `<w:rtl/>` in the run properties marks the *characters* as RTL, which is
 *     what makes Word apply its Arabic-script shaping and the complex-script
 *     font rather than the Latin one.
 *
 * Set only the first and Word right-aligns Latin-shaped Persian. Set only the
 * second and the paragraph stays left-aligned. B mark already knows the
 * direction of every block, so both are set from the same answer.
 *
 * The library is 4.5 MB, so it is imported lazily: nobody who never exports to
 * Word pays for it.
 */

import { detectDirection, isStrongRtl, isStrongLtr } from '../direction/unicode';
import { store } from '../settings/store';
import { getHost } from '../platform';

type DocxModule = typeof import('docx');

let docxPromise: Promise<DocxModule | null> | null = null;

async function loadDocx(): Promise<DocxModule | null> {
  if (!docxPromise) {
    docxPromise = import('docx').catch((error) => {
      console.warn('[b-mark] docx failed to load:', error);
      return null;
    });
  }
  return docxPromise;
}

/** Word measures in half-points; the app measures in CSS pixels. */
const halfPoints = (px: number) => Math.round(px * 0.75 * 2);
/** …and in twentieths of a point for spacing. */
const twips = (px: number) => Math.round(px * 15);

const HEADING_SCALE = [1.9, 1.5, 1.25, 1.08, 1.0, 0.92];

interface Ctx {
  d: DocxModule;
  baseSize: number;
  /** Direction of the document as a whole, for anything indeterminate. */
  fallback: 'rtl' | 'ltr';
}

/**
 * Split a text node into runs of a single script.
 *
 * Word applies its complex-script shaping and font per *run*, so a run marked
 * `rtl` containing "Visual Studio Code" gets the Arabic engine applied to
 * Latin letters — the product name comes out subtly wrong, and in some fonts
 * badly wrong. One run per script region fixes that.
 *
 * Neutral characters — spaces, digits, punctuation — attach to the segment
 * they follow, which is what the Unicode bidi algorithm does too, so a comma
 * after a Persian word stays with the Persian.
 */
export function scriptSegments(text: string): Array<{ text: string; rtl: boolean }> {
  const segments: Array<{ text: string; rtl: boolean }> = [];
  let buffer = '';
  let current: boolean | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    segments.push({ text: buffer, rtl: current ?? false });
    buffer = '';
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const strong = isStrongRtl(cp) ? true : isStrongLtr(cp) ? false : null;

    if (strong === null) {
      // Neutral: stays with whatever is being built.
      buffer += ch;
      continue;
    }
    if (current === null) {
      current = strong;
    } else if (strong !== current) {
      flush();
      current = strong;
    }
    buffer += ch;
  }
  flush();

  return segments;
}

function dirOf(el: Element, ctx: Ctx): 'rtl' | 'ltr' {
  const attr = el.getAttribute('dir');
  if (attr === 'rtl' || attr === 'ltr') return attr;
  const inherited = el.closest('[dir]')?.getAttribute('dir');
  if (inherited === 'rtl' || inherited === 'ltr') return inherited;
  return detectDirection(el.textContent ?? '', ctx.fallback);
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
  superScript?: boolean;
  subScript?: boolean;
  highlight?: boolean;
  underline?: boolean;
}

/**
 * Walk an element's inline content into Word runs, carrying the formatting
 * down. Done by hand rather than with a generic HTML converter because the
 * per-run `rtl` flag has to be decided from the run's own text, not the
 * paragraph's — a Latin product name inside a Persian sentence must not be
 * marked as complex-script or Word will shape it wrongly.
 */
function inlineRuns(node: Node, ctx: Ctx, style: RunStyle = {}): unknown[] {
  const { TextRun, ExternalHyperlink } = ctx.d;
  const out: unknown[] = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.nodeValue ?? '';
      if (text.length === 0) continue;

      // One run per script region, so a Latin product name inside Persian
      // prose is not handed to Word's complex-script shaper.
      for (const segment of scriptSegments(text)) {
      const isRtl = segment.rtl;

      out.push(
        new TextRun({
          text: segment.text,
          bold: style.bold,
          italics: style.italics,
          strike: style.strike,
          superScript: style.superScript,
          subScript: style.subScript,
          underline: style.underline ? {} : undefined,
          highlight: style.highlight ? 'yellow' : undefined,
          // Character-level RTL: this is what triggers Word's Arabic shaping.
          // `undefined` rather than `false`, so the element is omitted instead
          // of written as `<w:rtl w:val="false"/>` — same meaning to Word,
          // but smaller output and nothing for a consumer to misread.
          rightToLeft: isRtl || undefined,
          font: style.code
            ? { name: 'Consolas' }
            : { name: 'Vazirmatn', cs: 'Vazirmatn' },
          size: style.code ? halfPoints(ctx.baseSize * 0.9) : halfPoints(ctx.baseSize),
          color: style.code ? '1B1F24' : undefined,
          shading: style.code ? { fill: 'F4F6F8' } : undefined,
        }),
      );
      }
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    const next: RunStyle = { ...style };
    switch (tag) {
      case 'strong':
      case 'b':
        next.bold = true;
        break;
      case 'em':
      case 'i':
        next.italics = true;
        break;
      case 'del':
      case 's':
        next.strike = true;
        break;
      case 'code':
      case 'kbd':
      case 'samp':
        next.code = true;
        break;
      case 'sup':
        next.superScript = true;
        break;
      case 'sub':
        next.subScript = true;
        break;
      case 'mark':
        next.highlight = true;
        break;
      case 'ins':
      case 'u':
        next.underline = true;
        break;
      case 'br':
        out.push(new TextRun({ break: 1 }));
        continue;
      case 'a': {
        const href = el.getAttribute('data-external') ?? el.getAttribute('href') ?? '';
        if (href && href !== '#') {
          out.push(
            new ExternalHyperlink({
              link: href,
              children: inlineRuns(el, ctx, { ...next, underline: true }) as never,
            }),
          );
          continue;
        }
        break;
      }
      case 'img':
        // Images would need the bytes fetched and embedded; a labelled
        // placeholder is honest and keeps the document structurally sound.
        out.push(new TextRun({ text: `[${el.getAttribute('alt') || 'image'}]`, italics: true }));
        continue;
    }

    out.push(...inlineRuns(el, ctx, next));
  }

  return out;
}

function paragraph(
  el: Element,
  ctx: Ctx,
  opts: { heading?: number; bullet?: number; numbered?: number; quote?: boolean } = {},
): unknown {
  const { Paragraph, HeadingLevel, AlignmentType } = ctx.d;
  const rtl = dirOf(el, ctx) === 'rtl';

  const headingLevels = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];

  const style: RunStyle = opts.heading ? { bold: true } : {};
  const children = inlineRuns(el, ctx, style);

  return new Paragraph({
    children: children as never,
    heading: opts.heading ? headingLevels[opts.heading - 1] : undefined,
    // Paragraph-level RTL: right-aligns and puts the punctuation correctly.
    bidirectional: rtl || undefined,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    bullet: opts.bullet !== undefined ? { level: Math.min(opts.bullet, 8) } : undefined,
    numbering:
      opts.numbered !== undefined
        ? { reference: 'bmark-ordered', level: Math.min(opts.numbered, 8) }
        : undefined,
    spacing: {
      after: twips(ctx.baseSize * store.current.paragraphSpacing * 0.5),
      line: Math.round(store.current.lineHeight * 240),
    },
    indent: opts.quote ? (rtl ? { right: twips(24) } : { left: twips(24) }) : undefined,
    border: opts.quote
      ? {
          [rtl ? 'right' : 'left']: { style: 'single', size: 12, color: 'D0D7DE', space: 8 },
        }
      : undefined,
  });
}

function codeBlock(pre: Element, ctx: Ctx): unknown[] {
  const { Paragraph, TextRun, AlignmentType } = ctx.d;
  const text = pre.textContent ?? '';

  // One paragraph per line: Word has no <pre>, and a single run with newlines
  // collapses. Shading each line reproduces the block.
  return text.replace(/\n$/, '').split('\n').map(
    (line) =>
      new Paragraph({
        children: [
          new TextRun({
            text: line || ' ',
            font: { name: 'Consolas' },
            size: halfPoints(ctx.baseSize * 0.88),
          }),
        ],
        // Code is lexical, never RTL.
        bidirectional: undefined,
        alignment: AlignmentType.LEFT,
        shading: { fill: 'F4F6F8' },
        spacing: { after: 0, line: 260 },
      }),
  );
}

function table(el: Element, ctx: Ctx): unknown {
  const { Table, TableRow, TableCell, Paragraph, WidthType, AlignmentType } = ctx.d;
  const rtl = dirOf(el, ctx) === 'rtl';

  const rows = Array.from(el.querySelectorAll('tr')).map((tr) => {
    const cells = Array.from(tr.querySelectorAll('th, td'));
    return new TableRow({
      tableHeader: cells.length > 0 && cells[0]!.tagName === 'TH',
      children: cells.map((cell) => {
        const cellRtl = dirOf(cell, ctx) === 'rtl';
        return new TableCell({
          children: [
            new Paragraph({
              children: inlineRuns(cell, ctx, {
                bold: cell.tagName === 'TH',
              }) as never,
              bidirectional: cellRtl || undefined,
              alignment: cellRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              spacing: { after: 0 },
            }),
          ],
          shading: cell.tagName === 'TH' ? { fill: 'F6F7F9' } : undefined,
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        });
      }),
    });
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Word reverses the column order for an RTL table, which is what a Persian
    // reader expects — the first column on the right.
    visuallyRightToLeft: rtl || undefined,
  });
}

/**
 * Emit one paragraph per list item, then recurse into nested lists.
 *
 * The recursion goes into each nested `ul`/`ol` child specifically — never
 * back into the `li` itself. In a *loose* list the item text sits in a `<p>`
 * child of the `li`; re-walking the `li` emitted that paragraph a second
 * time, so a parent item with a nested list appeared twice in the document.
 */
function listItems(list: Element, ctx: Ctx, depth: number): unknown[] {
  const out: unknown[] = [];
  const ordered = list.tagName === 'OL';

  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;

    // The item's own text, without any nested list.
    const shallow = li.cloneNode(true) as Element;
    for (const nested of Array.from(shallow.querySelectorAll('ul, ol'))) nested.remove();
    out.push(paragraph(shallow, ctx, ordered ? { numbered: depth } : { bullet: depth }));

    for (const child of Array.from(li.children)) {
      if (child.tagName === 'UL' || child.tagName === 'OL') {
        out.push(...listItems(child, ctx, depth + 1));
      }
    }
  }

  return out;
}

function convertBlocks(root: Element, ctx: Ctx, depth = 0): unknown[] {
  const out: unknown[] = [];

  for (const node of Array.from(root.children)) {
    const tag = node.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      out.push(paragraph(node, ctx, { heading: Number(tag[1]) }));
    } else if (tag === 'p') {
      out.push(paragraph(node, ctx));
    } else if (tag === 'ul' || tag === 'ol') {
      out.push(...listItems(node, ctx, depth));
    } else if (tag === 'blockquote') {
      for (const child of Array.from(node.children)) {
        out.push(paragraph(child, ctx, { quote: true }));
      }
    } else if (tag === 'pre') {
      out.push(...codeBlock(node, ctx));
    } else if (tag === 'div' && node.classList.contains('code-block')) {
      const pre = node.querySelector('pre');
      if (pre) out.push(...codeBlock(pre, ctx));
    } else if (tag === 'div' && node.classList.contains('table-wrap')) {
      const t = node.querySelector('table');
      if (t) out.push(table(t, ctx));
    } else if (tag === 'table') {
      out.push(table(node, ctx));
    } else if (tag === 'hr') {
      const { Paragraph } = ctx.d;
      out.push(
        new Paragraph({
          text: '',
          border: { bottom: { style: 'single', size: 6, color: 'D8DDE3', space: 1 } },
          spacing: { after: twips(12) },
        }),
      );
    } else if (tag === 'dl') {
      for (const child of Array.from(node.children)) {
        out.push(
          paragraph(child, ctx, child.tagName === 'DT' ? { heading: 6 } : { quote: true }),
        );
      }
    } else if (tag === 'aside' || tag === 'section' || tag === 'figure' || tag === 'details') {
      out.push(...convertBlocks(node, ctx, depth));
    }
  }

  return out;
}

export interface DocxOptions {
  title: string;
  content: HTMLElement;
}

/**
 * Build the package as raw bytes.
 *
 * Separate from `buildDocx` because a `Blob` is awkward to inspect — jsdom's
 * does not implement `arrayBuffer()` — and because the desktop host will want
 * to hand bytes straight to Rust rather than round-trip through a download.
 */
export async function buildDocxBuffer(options: DocxOptions): Promise<Uint8Array | null> {
  const d = await loadDocx();
  if (!d) return null;

  const s = store.current;
  const rootDir = options.content.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr';

  const ctx: Ctx = { d, baseSize: s.fontSize, fallback: rootDir };

  const children = convertBlocks(options.content, ctx);

  const doc = new d.Document({
    title: options.title,
    creator: 'B mark',
    description: 'Exported from B mark',
    // Vazirmatn is declared for both the Latin and the complex-script slot, so
    // Word does not silently substitute a Latin face for the Persian text.
    styles: {
      default: {
        document: {
          run: { font: { name: 'Vazirmatn', cs: 'Vazirmatn' }, size: halfPoints(s.fontSize) },
          // Note on direction: the library exposes `bidirectional` on a
          // Paragraph but not on the document default or the section, so the
          // flag is written onto every paragraph individually in
          // `paragraph()` below, and onto every table as
          // `visuallyRightToLeft`. That covers everything the reader sees.
        },
        heading1: { run: { size: halfPoints(s.fontSize * HEADING_SCALE[0]!), bold: true } },
        heading2: { run: { size: halfPoints(s.fontSize * HEADING_SCALE[1]!), bold: true } },
        heading3: { run: { size: halfPoints(s.fontSize * HEADING_SCALE[2]!), bold: true } },
        heading4: { run: { size: halfPoints(s.fontSize * HEADING_SCALE[3]!), bold: true } },
        heading5: { run: { size: halfPoints(s.fontSize * HEADING_SCALE[4]!), bold: true } },
        heading6: { run: { size: halfPoints(s.fontSize * HEADING_SCALE[5]!), bold: true } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'bmark-ordered',
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: 'decimal' as const,
            text: `%${i + 1}.`,
            alignment: (rootDir === 'rtl' ? 'right' : 'left') as never,
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } },
          // Note: the library exposes no section-level `bidi`. It is not
          // needed — every paragraph carries `bidirectional`, every table
          // carries `visuallyRightToLeft`, and the document default above
          // covers the rest, which together is what actually shows on screen.
        },
        children: children as never,
      },
    ],
  });

  const buffer = await d.Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

export async function buildDocx(options: DocxOptions): Promise<Blob | null> {
  const bytes = await buildDocxBuffer(options);
  if (!bytes) return null;
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Build and download. */
export async function exportDocx(options: DocxOptions): Promise<string | null> {
  // The buffer, not the Blob: the host wants bytes, and going through a Blob
  // only to read it straight back adds a step that jsdom cannot even perform.
  const bytes = await buildDocxBuffer(options);
  if (!bytes) throw new Error('docx_unavailable');

  const base = options.title.replace(/\.[^.]+$/, '') || 'document';

  return getHost().saveExport({
    name: `${base}.docx`,
    bytes,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filterName: 'Word document',
    extensions: ['docx'],
  });
}
