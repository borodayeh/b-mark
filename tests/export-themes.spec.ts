/**
 * DOCX export, content themes and spell checking.
 *
 * The DOCX tests unzip the produced package and read the raw OOXML, because
 * the whole value of this exporter is in two XML elements — `<w:bidi/>` and
 * `<w:rtl/>` — that no higher-level assertion would catch.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { renderInto } from '../src/markdown/pipeline';
import { buildDocx, buildDocxBuffer, scriptSegments } from '../src/components/docx-export';
import { buildStandaloneHtml } from '../src/components/export';
import {
  CONTENT_THEMES,
  CONTENT_THEME_NAMES,
  applyContentTheme,
  contentThemeCss,
  contentThemeVars,
} from '../src/components/content-themes';
import { candidateWords, looksWorthChecking } from '../src/persian/words';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main id="host"></main>';
  host = document.getElementById('host')!;
});

/**
 * Pull `word/document.xml` out of the package.
 *
 * Works from the raw bytes rather than a Blob: jsdom's Blob has no
 * `arrayBuffer()`, and the bytes are what the exporter actually produces.
 */
async function documentXml(src: HTMLElement, title = 'x'): Promise<string> {
  const bytes = await buildDocxBuffer({ title, content: src });
  expect(bytes).toBeTruthy();
  const { unzipSync, strFromU8 } = await import('fflate');
  return strFromU8(unzipSync(bytes!)['word/document.xml']!);
}

// ------------------------------------------------------------------ docx --

describe('DOCX export', () => {
  it('produces a real Office Open XML package', async () => {
    renderInto(host, '# Title\n\nA paragraph.');
    const buf = (await buildDocxBuffer({ title: 'x.md', content: host }))!;
    expect(buf).toBeTruthy();
    // Every .docx is a zip, so it begins with the local file header magic.
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]);

    const { unzipSync } = await import('fflate');
    const names = Object.keys(unzipSync(buf));
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('word/document.xml');
  });

  it('carries the text through', async () => {
    renderInto(host, '# سلام دنیا\n\nمتن آزمایشی.');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('سلام دنیا');
    expect(xml).toContain('متن آزمایشی');
  });

  it('marks a Persian paragraph bidi at the paragraph level', async () => {
    // <w:bidi/> is what right-aligns the paragraph and puts the full stop on
    // the correct side. Without it Word left-aligns Persian.
    renderInto(host, 'این یک پاراگراف فارسی است.');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('<w:bidi');
  });

  it('marks Persian runs rtl at the character level', async () => {
    // <w:rtl/> is what makes Word use its complex-script shaping and font.
    // Setting only <w:bidi/> gives right-aligned but Latin-shaped Persian.
    renderInto(host, 'متن فارسی');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('<w:rtl');
  });

  it('does NOT mark an English paragraph as bidi', async () => {
    renderInto(host, 'This is an English paragraph.');
    const xml = await documentXml(host, 'x');
    // The only bidi in the file should be absent entirely for a pure-LTR doc.
    expect(xml).not.toContain('<w:bidi');
  });

  it('gives each paragraph of a mixed document its own direction', async () => {
    renderInto(host, 'متن فارسی.\n\nEnglish paragraph.');
    const xml = await documentXml(host, 'x');
    const paragraphs = xml.split(/<w:p[ >]/).slice(1);
    const withBidi = paragraphs.filter((p) => p.includes('<w:bidi')).length;
    // Exactly one of the two carries it.
    expect(withBidi).toBe(1);
  });

  it('keeps a Latin run inside Persian prose unmarked', async () => {
    // Marking "Visual Studio Code" as complex-script makes Word shape Latin
    // letters with the Arabic engine, which comes out subtly — sometimes
    // badly — wrong. The text node is split into one run per script.
    renderInto(host, 'من از Visual Studio Code استفاده می‌کنم.');
    const xml = await documentXml(host, 'x');
    const idx = xml.indexOf('Visual Studio Code');
    expect(idx).toBeGreaterThan(-1);
    const runStart = xml.lastIndexOf('<w:r>', idx);
    expect(xml.slice(runStart, idx)).not.toContain('<w:rtl');
    // …while the Persian around it is still marked.
    expect(xml).toContain('<w:rtl');
  });

  it('emits headings as real Word headings', async () => {
    renderInto(host, '# One\n\n## Two');
    const xml = await documentXml(host, 'x');
    expect(xml).toMatch(/w:val="Heading1"/);
    expect(xml).toMatch(/w:val="Heading2"/);
  });

  it('emits tables as Word tables and flips RTL ones', async () => {
    renderInto(host, '| نام | سن |\n|---|---|\n| علی | ۳۰ |');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('<w:tbl>');
    // visuallyRightToLeft puts the first column on the right.
    expect(xml).toContain('<w:bidiVisual');
  });

  it('keeps code left-to-right', async () => {
    renderInto(host, 'توضیح:\n\n```js\nconst a = 1;\n```');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('const a = 1;');
    const idx = xml.indexOf('const a = 1;');
    const paraStart = xml.lastIndexOf('<w:p ', idx);
    expect(xml.slice(paraStart, idx)).not.toContain('<w:bidi');
  });

  it('renders lists', async () => {
    renderInto(host, '- alpha\n- beta');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('alpha');
    expect(xml).toContain('beta');
    expect(xml).toContain('<w:numPr>');
  });

  it('emits a nested list item exactly once', async () => {
    // In a *loose* list the item text lives in a <p> child of the <li>; the
    // exporter used to walk the <li> a second time for the nested list and
    // re-emitted that paragraph, so the parent item appeared twice.
    renderInto(host, '- parent item\n\n  - child one\n  - child two\n');
    const xml = await documentXml(host, 'x');
    expect(xml.split('parent item').length - 1).toBe(1);
    expect(xml.split('child one').length - 1).toBe(1);
    expect(xml.split('child two').length - 1).toBe(1);
  });

  it('keeps every level of a deeply nested list', async () => {
    // Words chosen not to collide with OOXML boilerplate ('one' would match
    // inside "standalone" in the XML declaration).
    renderInto(host, '- unus\n\n  - duo\n\n    - tres\n');
    const xml = await documentXml(host, 'x');
    for (const word of ['unus', 'duo', 'tres']) {
      expect(xml.split(word).length - 1).toBe(1);
    }
  });

  it('turns links into real hyperlinks', async () => {
    renderInto(host, '[docs](https://example.com)');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('<w:hyperlink');
  });

  it('replaces images with a labelled placeholder rather than breaking', async () => {
    renderInto(host, '![diagram](./a.png)');
    const xml = await documentXml(host, 'x');
    expect(xml).toContain('[diagram]');
  });

  it('survives an empty document', async () => {
    renderInto(host, '');
    await expect(buildDocxBuffer({ title: 'empty', content: host })).resolves.toBeTruthy();
  });

  it('buildDocx wraps the same bytes in a Blob', async () => {
    renderInto(host, 'text');
    const blob = await buildDocx({ title: 'x', content: host });
    expect(blob?.type).toContain('wordprocessingml');
    expect(blob!.size).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------- themes --

describe('script segmentation', () => {
  it('splits mixed text into one segment per script', () => {
    const segs = scriptSegments('من از Visual Studio Code استفاده می‌کنم');
    expect(segs.length).toBeGreaterThanOrEqual(3);
    const latin = segs.find((s) => s.text.includes('Visual'));
    expect(latin?.rtl).toBe(false);
    expect(segs[0]?.rtl).toBe(true);
  });

  it('keeps pure text as a single segment', () => {
    expect(scriptSegments('all english here')).toHaveLength(1);
    expect(scriptSegments('همه فارسی')).toHaveLength(1);
  });

  it('attaches neutral characters to the segment they follow', () => {
    // The comma belongs with the Persian before it, as the bidi algorithm
    // would also decide.
    const segs = scriptSegments('سلام، hello');
    expect(segs[0]?.text).toContain('،');
  });

  it('loses no characters', () => {
    const src = 'متن with 123 و ARABIC عربی — end.';
    expect(scriptSegments(src).map((s) => s.text).join('')).toBe(src);
  });

  it('handles an empty string', () => {
    expect(scriptSegments('')).toEqual([]);
  });
});

describe('content themes', () => {
  it('offers exactly the four considered options', () => {
    expect(CONTENT_THEME_NAMES).toEqual(['default', 'academic', 'book', 'compact']);
  });

  it('never sets a physical text alignment, which is the engine\'s job', () => {
    const css = contentThemeCss();
    expect(css).not.toMatch(/text-align\s*:\s*(left|right)/);
    // Physical margins/padding would also break in RTL.
    expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
  });

  it('uses logical properties for anything side-dependent', () => {
    const css = contentThemeCss();
    expect(css).toContain('border-inline-start');
    expect(css).toContain('padding-inline');
  });

  it('applies its variables to the element', () => {
    applyContentTheme(host, 'book');
    expect(host.getAttribute('data-theme-content')).toBe('book');
    expect(host.style.getPropertyValue('--content-max-width')).toBe('640px');
  });

  it('clears the previous theme rather than layering on it', () => {
    applyContentTheme(host, 'compact');
    expect(host.style.getPropertyValue('--content-font-size')).toBe('14px');
    applyContentTheme(host, 'academic');
    // academic sets no font size, so compact's must be gone.
    expect(host.style.getPropertyValue('--content-font-size')).toBe('');
  });

  it('lets a user setting win over the theme', () => {
    applyContentTheme(host, 'book', { '--content-max-width': '999px' });
    expect(host.style.getPropertyValue('--content-max-width')).toBe('999px');
  });

  it('falls back to default for an unknown name', () => {
    applyContentTheme(host, 'nope' as never);
    expect(host.getAttribute('data-theme-content')).toBe('default');
  });

  it('exposes its variables for baking into an export', () => {
    expect(contentThemeVars('academic')['--content-max-width']).toBe('720px');
    expect(contentThemeVars('default')).toEqual({});
  });

  it('scopes every rule so themes cannot leak into each other', () => {
    for (const theme of Object.values(CONTENT_THEMES)) {
      if (!theme.css.trim()) continue;
      for (const rule of theme.css.split('}').filter((r) => r.includes('{'))) {
        const selector = rule.split('{')[0]!.trim();
        if (!selector || selector.startsWith('/*')) continue;
        expect(selector, selector).toContain(`data-theme-content='${theme.name}'`);
      }
    }
  });

  it('travels into the standalone HTML export', async () => {
    // The exported file must carry the theme's rules, not just its attribute:
    // a document themed "book" has to read as a book for the recipient too.
    host.className = 'content';
    renderInto(host, '# Title\n\npara one.\n\npara two.');
    applyContentTheme(host, 'book');
    const out = await buildStandaloneHtml({ title: 'x', content: host });
    expect(out).toContain("data-theme-content=\"book\"");
    expect(out).toContain(".content[data-theme-content='book'] p + p");
    expect(out).toContain('text-indent');
  });

  it('export contains the rules of every non-default theme', async () => {
    host.className = 'content';
    renderInto(host, 'text');
    for (const name of ['academic', 'compact'] as const) {
      applyContentTheme(host, name);
      const out = await buildStandaloneHtml({ title: 'x', content: host });
      expect(out, name).toContain(`data-theme-content='${name}'`);
    }
  });
});

// ------------------------------------------------------------ spellcheck --

describe('spell checking — the masking rule', () => {
  // A checker that flags every identifier is one people switch off within a
  // minute, so this matters more than the dictionary itself. Tested through
  // `candidateWords`, which is the decision point, and which costs nothing —
  // building the Persian Hunspell checker takes ~172 MB and ~2.3 s, and no
  // test suite should pay that to assert a regex.
  const words = (src: string) => candidateWords(src).map((c) => c.word);

  it('skips fenced code', () => {
    expect(words('```js\nconst zzzqqq = xyzzyfoo;\n```')).not.toContain('zzzqqq');
  });

  it('skips inline code', () => {
    expect(words('run `zzzqqqfoo` now')).not.toContain('zzzqqqfoo');
  });

  it('skips URLs and Windows paths', () => {
    const w = words('see https://example.com/zzzqqqfoo and C:\\dir\\xyzzyfoo\\a.md');
    expect(w).not.toContain('zzzqqqfoo');
    expect(w).not.toContain('xyzzyfoo');
  });

  it('skips e-mail addresses', () => {
    expect(words('mail zzzqqqfoo@example.com now')).not.toContain('zzzqqqfoo');
  });

  it('skips YAML front matter, whose keys are identifiers', () => {
    expect(words('---\nzzzqqqfoo: xyzzyfoo\n---\n\ntext')).not.toContain('zzzqqqfoo');
  });

  it('skips words containing digits', () => {
    expect(words('version zzzqqq2foo released')).not.toContain('zzzqqq2foo');
  });

  it('skips a capitalised word, which is usually a name', () => {
    expect(words('I met Zzzqqqfoo yesterday')).not.toContain('Zzzqqqfoo');
  });

  it('does not split a ZWNJ compound into unknown fragments', () => {
    // Splitting on the ZWNJ would report «می» and «خواهم» separately.
    const w = words('من می\u200cخواهم بروم');
    expect(w).not.toContain('می');
    expect(w.some((x) => x.includes('\u200c'))).toBe(true);
  });

  it('does check ordinary prose', () => {
    expect(words('this sentence has real words')).toContain('sentence');
    expect(words('این جمله واژه دارد')).toContain('جمله');
  });

  it('tags each candidate with its language', () => {
    // Note: «فارسی» is on the allowlist, so it is deliberately not a
    // candidate; use a word that is not.
    const c = candidateWords('English word و واژهٔ دیگر');
    expect(c.find((x) => x.word === 'word')?.lang).toBe('en');
    expect(c.find((x) => x.word === 'دیگر')?.lang).toBe('fa');
  });

  it('records the offset so a highlight can be placed', () => {
    const c = candidateWords('alpha beta');
    expect(c[1]?.start).toBe(6);
  });

  it('returns nothing for an empty document', () => {
    expect(candidateWords('')).toEqual([]);
  });

  it('respects the word cap on a huge document', () => {
    expect(candidateWords('word '.repeat(5000), { maxWords: 100 }).length).toBeLessThanOrEqual(100);
  });

  it('has a cheap pre-check so no dictionary loads for a numeric file', () => {
    expect(looksWorthChecking('some text')).toBe(true);
    expect(looksWorthChecking('123 456 ---')).toBe(false);
  });
});

describe('spell checking — regression: the infinite loop', () => {
  // One pattern in the skip list was written without the `g` flag. `exec` in a
  // loop only advances `lastIndex` on a global regex, so it returned the same
  // match from position 0 forever and the ranges array grew until the process
  // ran out of memory. A document with front matter was enough to hang the app.
  it('returns from a document with YAML front matter', () => {
    const out = candidateWords('---\ntitle: X\nauthor: Y\n---\n\nSome prose here.');
    expect(out.map((c) => c.word)).toContain('prose');
  });

  it('returns from front matter terminated with ...', () => {
    expect(() => candidateWords('---\na: b\n...\n\ntext')).not.toThrow();
  });

  it('returns from a document that is only front matter', () => {
    expect(() => candidateWords('---\na: b\n---\n')).not.toThrow();
  });

  it('handles a large document without unbounded growth', () => {
    const big = '---\ntitle: X\n---\n\n' + 'یک واژه دیگر '.repeat(2000);
    const out = candidateWords(big, { maxWords: 500 });
    expect(out.length).toBeLessThanOrEqual(500);
  });
});
